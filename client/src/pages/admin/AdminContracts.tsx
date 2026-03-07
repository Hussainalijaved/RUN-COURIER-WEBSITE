import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Plus,
  Pencil,
  Trash2,
  Send,
  Eye,
  FileSignature,
  Loader2,
  RefreshCw,
  CheckCircle,
  Clock,
  Mail,
} from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const vehicleTypeOrder = ['motorbike', 'car', 'small_van', 'medium_van', 'large_van', 'luton_van', 'flatbed'];
const vehicleTypeLabels: Record<string, string> = {
  motorbike: 'Motorbike',
  car: 'Car',
  small_van: 'Small Van',
  medium_van: 'Medium Van',
  large_van: 'Large Van',
  luton_van: 'Luton Van',
  flatbed: 'Flatbed',
};

export default function AdminContracts() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('templates');
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [viewingContract, setViewingContract] = useState<any>(null);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateContent, setTemplateContent] = useState('');

  const { data: templates = [], isLoading: templatesLoading } = useQuery<any[]>({
    queryKey: ['/api/contract-templates'],
  });

  const { data: contracts = [], isLoading: contractsLoading } = useQuery<any[]>({
    queryKey: ['/api/driver-contracts'],
    refetchInterval: 15000,
  });

  const { data: drivers = [] } = useQuery<any[]>({
    queryKey: ['/api/drivers'],
  });

  const driversGroupedByVehicle = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const d of drivers) {
      const vt = d.vehicleType || 'other';
      if (!groups[vt]) groups[vt] = [];
      groups[vt].push(d);
    }
    const ordered: { type: string; label: string; drivers: any[] }[] = [];
    for (const vt of vehicleTypeOrder) {
      if (groups[vt]?.length) {
        ordered.push({ type: vt, label: vehicleTypeLabels[vt] || vt, drivers: groups[vt] });
      }
    }
    for (const vt of Object.keys(groups)) {
      if (!vehicleTypeOrder.includes(vt) && groups[vt]?.length) {
        ordered.push({ type: vt, label: vehicleTypeLabels[vt] || vt, drivers: groups[vt] });
      }
    }
    return ordered;
  }, [drivers]);

  const createTemplateMutation = useMutation({
    mutationFn: async (data: { title: string; content: string }) => {
      const res = await apiRequest('POST', '/api/contract-templates', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contract-templates'] });
      setShowTemplateDialog(false);
      resetTemplateForm();
      toast({ title: 'Template created' });
    },
    onError: () => toast({ title: 'Failed to create template', variant: 'destructive' }),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { title: string; content: string } }) => {
      const res = await apiRequest('PATCH', `/api/contract-templates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contract-templates'] });
      setShowTemplateDialog(false);
      resetTemplateForm();
      toast({ title: 'Template updated' });
    },
    onError: () => toast({ title: 'Failed to update template', variant: 'destructive' }),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/contract-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contract-templates'] });
      toast({ title: 'Template deleted' });
    },
    onError: () => toast({ title: 'Failed to delete template', variant: 'destructive' }),
  });

  const sendContractMutation = useMutation({
    mutationFn: async (data: { templateId: string; driverId: string }) => {
      const res = await apiRequest('POST', '/api/admin/contracts/send', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver-contracts'] });
      setShowSendDialog(false);
      setSelectedTemplateId('');
      setSelectedDriverId('');
      toast({ title: 'Contract sent to driver' });
    },
    onError: () => toast({ title: 'Failed to send contract', variant: 'destructive' }),
  });

  const resendContractMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('POST', `/api/admin/contracts/resend/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver-contracts'] });
      toast({ title: 'Contract email resent' });
    },
    onError: (err: any) => {
      const msg = err?.message || '';
      if (msg.includes('already signed')) {
        toast({ title: 'Contract is already signed', variant: 'destructive' });
        queryClient.invalidateQueries({ queryKey: ['/api/driver-contracts'] });
      } else {
        toast({ title: 'Failed to resend email', variant: 'destructive' });
      }
    },
  });

  function resetTemplateForm() {
    setEditingTemplate(null);
    setTemplateTitle('');
    setTemplateContent('');
  }

  function openCreateTemplate() {
    resetTemplateForm();
    setShowTemplateDialog(true);
  }

  function openEditTemplate(template: any) {
    setEditingTemplate(template);
    setTemplateTitle(template.title);
    setTemplateContent(template.content);
    setShowTemplateDialog(true);
  }

  function handleSaveTemplate() {
    if (!templateTitle.trim() || !templateContent.trim()) return;
    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data: { title: templateTitle, content: templateContent } });
    } else {
      createTemplateMutation.mutate({ title: templateTitle, content: templateContent });
    }
  }

  function openSendDialog(templateId: string) {
    setSelectedTemplateId(templateId);
    setSelectedDriverId('');
    setShowSendDialog(true);
  }

  function handleSendContract() {
    if (!selectedTemplateId || !selectedDriverId) return;
    sendContractMutation.mutate({ templateId: selectedTemplateId, driverId: selectedDriverId });
  }

  function openViewContract(contract: any) {
    setViewingContract(contract);
    setShowViewDialog(true);
  }

  const isSaving = createTemplateMutation.isPending || updateTemplateMutation.isPending;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Contracts</h1>
            <p className="text-sm text-muted-foreground">Manage contract templates and track driver contracts</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-testid="tabs-contracts">
            <TabsTrigger value="templates" data-testid="tab-templates">
              <FileSignature className="w-4 h-4 mr-1.5" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="sent" data-testid="tab-sent-contracts">
              <Send className="w-4 h-4 mr-1.5" />
              Sent Contracts
              {contracts.length > 0 && (
                <Badge variant="secondary" className="ml-1.5">{contracts.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={openCreateTemplate} data-testid="button-create-template">
                <Plus className="w-4 h-4 mr-1.5" />
                New Template
              </Button>
            </div>

            {templatesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
              </div>
            ) : templates.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileSignature className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No contract templates yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Create your first template to start sending contracts to drivers</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {templates.map((t: any) => (
                  <Card key={t.id} data-testid={`card-template-${t.id}`}>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                      <CardTitle className="text-base">{t.title}</CardTitle>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openSendDialog(t.id)} data-testid={`button-send-template-${t.id}`}>
                          <Send className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEditTemplate(t)} data-testid={`button-edit-template-${t.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteTemplateMutation.mutate(t.id)} data-testid={`button-delete-template-${t.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">{t.content?.substring(0, 200)}{t.content?.length > 200 ? '...' : ''}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Created {new Date(t.created_at).toLocaleDateString('en-GB')}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <Card>
              <CardContent className="py-4">
                <p className="text-sm text-muted-foreground">
                  <strong>Available placeholders:</strong>{' '}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">{'{{driver_name}}'}</code>{' '}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">{'{{driver_code}}'}</code>{' '}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">{'{{date}}'}</code>{' '}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">{'{{driver_email}}'}</code>{' '}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">{'{{driver_phone}}'}</code>{' '}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">{'{{vehicle_type}}'}</code>
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sent" className="space-y-4">
            {contractsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : contracts.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Send className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No contracts sent yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Send a contract from the Templates tab</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead>Signed</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map((c: any) => (
                      <TableRow key={c.id} data-testid={`row-contract-${c.id}`}>
                        <TableCell>
                          <div>
                            <span className="font-medium">{c.driver_name}</span>
                            {c.driver_email && (
                              <span className="block text-xs text-muted-foreground">{c.driver_email}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {c.status === 'signed' ? (
                            <Badge variant="default" className="bg-green-600" data-testid={`badge-status-${c.id}`}>
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Signed
                            </Badge>
                          ) : (
                            <Badge variant="secondary" data-testid={`badge-status-${c.id}`}>
                              <Clock className="w-3 h-3 mr-1" />
                              Sent
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.sent_at ? new Date(c.sent_at).toLocaleDateString('en-GB') : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.signed_at ? new Date(c.signed_at).toLocaleDateString('en-GB') : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openViewContract(c)} data-testid={`button-view-contract-${c.id}`}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            {c.status !== 'signed' && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => resendContractMutation.mutate(c.id)}
                                disabled={resendContractMutation.isPending}
                                data-testid={`button-resend-contract-${c.id}`}
                              >
                                {resendContractMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle data-testid="text-template-dialog-title">
                {editingTemplate ? 'Edit Template' : 'New Contract Template'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="template-title">Title</Label>
                <Input
                  id="template-title"
                  value={templateTitle}
                  onChange={(e) => setTemplateTitle(e.target.value)}
                  placeholder="e.g. Driver Agreement 2026"
                  data-testid="input-template-title"
                />
              </div>
              <div>
                <Label htmlFor="template-content">Contract Content</Label>
                <Textarea
                  id="template-content"
                  value={templateContent}
                  onChange={(e) => setTemplateContent(e.target.value)}
                  placeholder="Enter contract text... Use {{driver_name}}, {{driver_code}}, {{date}} as placeholders."
                  className="min-h-[300px] font-mono text-sm"
                  data-testid="input-template-content"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTemplateDialog(false)} data-testid="button-cancel-template">
                Cancel
              </Button>
              <Button
                onClick={handleSaveTemplate}
                disabled={isSaving || !templateTitle.trim() || !templateContent.trim()}
                data-testid="button-save-template"
              >
                {isSaving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                {editingTemplate ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle data-testid="text-send-dialog-title">Send Contract to Driver</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Template</Label>
                <p className="text-sm text-muted-foreground">
                  {templates.find((t: any) => t.id === selectedTemplateId)?.title || 'Selected template'}
                </p>
              </div>
              <div>
                <Label htmlFor="send-driver-select">Select Driver</Label>
                <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                  <SelectTrigger data-testid="select-send-driver">
                    <SelectValue placeholder="Choose a driver" />
                  </SelectTrigger>
                  <SelectContent>
                    {driversGroupedByVehicle.map((group) => (
                      <SelectGroup key={group.type}>
                        <SelectLabel>{group.label}</SelectLabel>
                        {group.drivers.map((d: any) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.driverCode ? `[${d.driverCode}] ` : ''}{d.fullName || d.full_name || 'Unknown'}
                            {d.email ? ` (${d.email})` : ''}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSendDialog(false)} data-testid="button-cancel-send">
                Cancel
              </Button>
              <Button
                onClick={handleSendContract}
                disabled={sendContractMutation.isPending || !selectedDriverId}
                data-testid="button-confirm-send"
              >
                {sendContractMutation.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                <Send className="w-4 h-4 mr-1.5" />
                Send Contract
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle data-testid="text-view-contract-title">
                Contract — {viewingContract?.driver_name}
              </DialogTitle>
            </DialogHeader>
            {viewingContract && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {viewingContract.status === 'signed' ? (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Signed on {new Date(viewingContract.signed_at).toLocaleDateString('en-GB')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <Clock className="w-3 h-3 mr-1" />
                      Awaiting signature
                    </Badge>
                  )}
                  {viewingContract.driver_email && (
                    <span className="text-sm text-muted-foreground">{viewingContract.driver_email}</span>
                  )}
                </div>

                <Card>
                  <CardContent className="py-4">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed" data-testid="text-contract-content">
                      {viewingContract.contract_content}
                    </div>
                  </CardContent>
                </Card>

                {viewingContract.status === 'signed' && viewingContract.signature_data && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Signature</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="border rounded-md p-3 bg-white dark:bg-gray-950">
                        <img
                          src={viewingContract.signature_data}
                          alt="Driver signature"
                          className="max-h-32 mx-auto"
                          data-testid="img-signature"
                        />
                      </div>
                      {viewingContract.signed_name && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Signed as: <strong>{viewingContract.signed_name}</strong>
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {viewingContract.status !== 'signed' && (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        resendContractMutation.mutate(viewingContract.id);
                      }}
                      disabled={resendContractMutation.isPending}
                      data-testid="button-resend-from-view"
                    >
                      {resendContractMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Mail className="w-4 h-4 mr-1.5" />}
                      Resend Email
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
