import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, getAuthHeaders } from '@/lib/queryClient';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import {
  Bell, Send, List, Info, AlertTriangle, Zap,
  Users, User, ChevronLeft, ChevronRight, Search,
  Filter, Calendar, RefreshCw, Megaphone, MessageSquare,
} from 'lucide-react';
import { format } from 'date-fns';

type TargetType = 'all_drivers' | 'specific_driver' | 'all_customers' | 'specific_customer';
type NotifType = 'info' | 'alert' | 'urgent';

const TARGET_OPTIONS: { value: TargetType; label: string; icon: any }[] = [
  { value: 'all_drivers', label: 'All Drivers', icon: Users },
  { value: 'specific_driver', label: 'Specific Driver', icon: User },
  { value: 'all_customers', label: 'All Customers', icon: Users },
  { value: 'specific_customer', label: 'Specific Customer', icon: User },
];

const NOTIF_TYPES: { value: NotifType; label: string; icon: any; color: string; bg: string }[] = [
  { value: 'info', label: 'Info', icon: Info, color: 'text-blue-500', bg: 'bg-blue-500/10 border-blue-500/30' },
  { value: 'alert', label: 'Alert', icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  { value: 'urgent', label: 'Urgent', icon: Zap, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/30' },
];

const TARGET_LABEL: Record<string, string> = {
  all_drivers: 'All Drivers',
  specific_driver: 'Specific Driver',
  all_customers: 'All Customers',
  specific_customer: 'Specific Customer',
};

function PhonePreview({ title, message, notifType, sendSms }: { title: string; message: string; notifType: NotifType; sendSms?: boolean }) {
  const typeConf = NOTIF_TYPES.find(t => t.value === notifType) || NOTIF_TYPES[0];
  const Icon = typeConf.icon;
  const now = new Date();

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Live Preview</p>
      <div className="relative w-[240px] h-[480px] rounded-[2.5rem] border-4 border-border bg-background shadow-lg overflow-hidden flex flex-col">
        <div className="absolute inset-0 bg-gradient-to-b from-muted/40 to-background pointer-events-none" />
        <div className="flex justify-center pt-3 pb-1 z-10">
          <div className="w-20 h-5 rounded-full bg-foreground/10" />
        </div>
        <div className="flex-1 flex flex-col gap-2 p-3 z-10">
          <div className="text-center text-xs text-muted-foreground mt-1">
            {format(now, 'h:mm a')}
          </div>
          {/* Push notification preview */}
          <div className={`rounded-xl border p-3 shadow-sm ${typeConf.bg}`}>
            <div className="flex items-start gap-2">
              <div className={`mt-0.5 rounded-lg p-1 ${typeConf.bg}`}>
                <Icon className={`h-3.5 w-3.5 ${typeConf.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-foreground truncate">Run Courier</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">now</span>
                </div>
                <p className="text-xs font-semibold text-foreground mt-0.5 line-clamp-1">
                  {title || 'Notification Title'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">
                  {message || 'Your notification message will appear here...'}
                </p>
              </div>
            </div>
          </div>
          {/* SMS preview when toggled */}
          {sendSms && (
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 shadow-sm">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 rounded-lg p-1 bg-green-500/10">
                  <MessageSquare className="h-3.5 w-3.5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-foreground truncate">Run Courier · SMS</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">now</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-4">
                    {title && message
                      ? `Run Courier: [${notifType.toUpperCase()}] ${title}\n${message}`
                      : 'SMS text will appear here...'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-center pb-4 z-10">
          <div className="w-24 h-1 rounded-full bg-foreground/20" />
        </div>
      </div>
    </div>
  );
}

function SendNotificationTab() {
  const { toast } = useToast();
  const [targetType, setTargetType] = useState<TargetType>('all_drivers');
  const [notifType, setNotifType] = useState<NotifType>('info');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [driverSearch, setDriverSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [driverDropdownOpen, setDriverDropdownOpen] = useState(false);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [selectedDriverName, setSelectedDriverName] = useState('');
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [sendSms, setSendSms] = useState(false);

  const { data: drivers = [] } = useQuery<any[]>({
    queryKey: ['/api/notifications/drivers'],
    staleTime: 60_000,
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['/api/notifications/customers'],
    staleTime: 60_000,
  });

  // Search drivers by name, email, or driver code (e.g. RC28R)
  const filteredDrivers = useMemo(() =>
    drivers.filter(d => {
      if (!driverSearch) return true;
      const q = driverSearch.toLowerCase();
      return (
        d.full_name?.toLowerCase().includes(q) ||
        d.email?.toLowerCase().includes(q) ||
        d.driver_code?.toLowerCase().includes(q)
      );
    }),
    [drivers, driverSearch]
  );

  const filteredCustomers = useMemo(() =>
    customers.filter(c => {
      if (!customerSearch) return true;
      const q = customerSearch.toLowerCase();
      return (
        c.full_name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(customerSearch)
      );
    }),
    [customers, customerSearch]
  );

  const sendMutation = useMutation({
    mutationFn: async (payload: any) => {
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Failed to send notification');
      }
      return resp.json();
    },
    onSuccess: (data) => {
      const parts: string[] = [`Sent to ${data.recipientCount} recipient${data.recipientCount !== 1 ? 's' : ''}`];
      if (data.smsSentCount > 0) parts.push(`${data.smsSentCount} SMS delivered`);
      toast({ title: 'Notification Sent', description: parts.join(' · ') + '.' });
      setTitle('');
      setMessage('');
      setTargetUserId('');
      setSelectedDriverName('');
      setSelectedCustomerName('');
      setDriverSearch('');
      setCustomerSearch('');
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notifications'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to Send', description: err.message, variant: 'destructive' });
    },
  });

  const isSpecificDriver = targetType === 'specific_driver';
  const isSpecificCustomer = targetType === 'specific_customer';

  const canSend = targetType && notifType && title.trim() && message.trim() &&
    (!isSpecificDriver || targetUserId) && (!isSpecificCustomer || targetUserId);

  const handleSend = () => {
    sendMutation.mutate({
      target_type: targetType,
      target_user_id: (isSpecificDriver || isSpecificCustomer) ? targetUserId : null,
      notification_type: notifType,
      title: title.trim(),
      message: message.trim(),
      send_sms: sendSms,
    });
  };

  const handleTargetChange = (val: TargetType) => {
    setTargetType(val);
    setTargetUserId('');
    setSelectedDriverName('');
    setSelectedCustomerName('');
    setDriverSearch('');
    setCustomerSearch('');
  };

  return (
    <div className="flex flex-col xl:flex-row gap-6">
      <Card className="flex-1">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            Send Notification
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Recipient Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {TARGET_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const active = targetType === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleTargetChange(opt.value)}
                    data-testid={`button-target-${opt.value}`}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-md border text-sm font-medium transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-foreground border-border hover-elevate'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {isSpecificDriver && (
            <div className="space-y-2">
              <Label>Select Driver</Label>
              <div className="relative">
                <div
                  className="flex items-center border rounded-md px-3 py-2 cursor-pointer bg-background hover-elevate"
                  onClick={() => setDriverDropdownOpen(v => !v)}
                  data-testid="button-select-driver"
                >
                  <User className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                  <span className={`flex-1 text-sm truncate ${selectedDriverName ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {selectedDriverName || 'Search for a driver...'}
                  </span>
                </div>
                {driverDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                    <div className="p-2 border-b">
                      <div className="flex items-center gap-2">
                        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                        <input
                          autoFocus
                          value={driverSearch}
                          onChange={e => setDriverSearch(e.target.value)}
                          placeholder="Search by name, email or ID (e.g. RC28R)..."
                          className="flex-1 bg-transparent text-sm outline-none"
                          data-testid="input-driver-search"
                        />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {filteredDrivers.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground text-center">No drivers found</div>
                      ) : filteredDrivers.slice(0, 50).map(d => (
                        <button
                          key={d.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-3"
                          onClick={() => {
                            setTargetUserId(d.id);
                            setSelectedDriverName(d.driver_code ? `${d.driver_code} – ${d.full_name || d.email}` : (d.full_name || d.email));
                            setDriverDropdownOpen(false);
                          }}
                          data-testid={`option-driver-${d.id}`}
                        >
                          {d.driver_code && (
                            <Badge variant="outline" className="text-xs font-mono shrink-0">{d.driver_code}</Badge>
                          )}
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium truncate">{d.full_name}</span>
                            <span className="text-muted-foreground text-xs truncate">{d.email}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {isSpecificCustomer && (
            <div className="space-y-2">
              <Label>Select Customer</Label>
              <div className="relative">
                <div
                  className="flex items-center border rounded-md px-3 py-2 cursor-pointer bg-background hover-elevate"
                  onClick={() => setCustomerDropdownOpen(v => !v)}
                  data-testid="button-select-customer"
                >
                  <User className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                  <span className={`flex-1 text-sm truncate ${selectedCustomerName ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {selectedCustomerName || 'Search for a customer...'}
                  </span>
                </div>
                {customerDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                    <div className="p-2 border-b">
                      <div className="flex items-center gap-2">
                        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                        <input
                          autoFocus
                          value={customerSearch}
                          onChange={e => setCustomerSearch(e.target.value)}
                          placeholder="Search customers..."
                          className="flex-1 bg-transparent text-sm outline-none"
                          data-testid="input-customer-search"
                        />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {filteredCustomers.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground text-center">No customers found</div>
                      ) : filteredCustomers.slice(0, 50).map(c => (
                        <button
                          key={c.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex flex-col"
                          onClick={() => {
                            setTargetUserId(c.id);
                            setSelectedCustomerName(c.full_name || c.email);
                            setCustomerDropdownOpen(false);
                          }}
                          data-testid={`option-customer-${c.id}`}
                        >
                          <span className="font-medium">{c.full_name}</span>
                          <span className="text-muted-foreground text-xs">{c.email}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Notification Type</Label>
            <div className="flex gap-2 flex-wrap">
              {NOTIF_TYPES.map(t => {
                const Icon = t.icon;
                const active = notifType === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => setNotifType(t.value)}
                    data-testid={`button-notif-type-${t.value}`}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                      active
                        ? `${t.bg} ${t.color} border-current`
                        : 'bg-background text-muted-foreground border-border hover-elevate'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label htmlFor="notif-title">Title</Label>
              <span className={`text-xs ${title.length > 45 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {title.length}/50
              </span>
            </div>
            <Input
              id="notif-title"
              value={title}
              onChange={e => setTitle(e.target.value.slice(0, 50))}
              placeholder="Enter notification title"
              data-testid="input-notif-title"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label htmlFor="notif-message">Message</Label>
              <span className={`text-xs ${message.length > 140 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {message.length}/150
              </span>
            </div>
            <Textarea
              id="notif-message"
              value={message}
              onChange={e => setMessage(e.target.value.slice(0, 150))}
              placeholder="Enter notification message"
              className="min-h-[100px] resize-none"
              data-testid="input-notif-message"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-4 py-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Also send as SMS</p>
                <p className="text-xs text-muted-foreground">Send a text message to recipients with a phone number on file</p>
              </div>
            </div>
            <Switch
              checked={sendSms}
              onCheckedChange={setSendSms}
              data-testid="switch-send-sms"
            />
          </div>

          <Button
            onClick={handleSend}
            disabled={!canSend || sendMutation.isPending}
            className="w-full"
            data-testid="button-send-notification"
          >
            {sendMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {sendMutation.isPending ? 'Sending...' : (sendSms ? 'Send Notification + SMS' : 'Send Notification')}
          </Button>
        </CardContent>
      </Card>

      <div className="xl:w-[260px] flex justify-center">
        <PhonePreview title={title} message={message} notifType={notifType} sendSms={sendSms} />
      </div>
    </div>
  );
}

function NotificationLogTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filterTargetType, setFilterTargetType] = useState('');
  const [filterNotifType, setFilterNotifType] = useState('');
  const [filterSenderRole, setFilterSenderRole] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (filterTargetType) params.set('target_type', filterTargetType);
  if (filterNotifType) params.set('notification_type', filterNotifType);
  if (filterSenderRole) params.set('sender_role', filterSenderRole);
  if (filterFrom) params.set('from', filterFrom);
  if (filterTo) params.set('to', filterTo);
  params.set('page', String(page));
  params.set('limit', '25');

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ['/api/admin/notifications', search, filterTargetType, filterNotifType, filterSenderRole, filterFrom, filterTo, page],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const resp = await fetch(`/api/admin/notifications?${params.toString()}`, { headers });
      if (!resp.ok) throw new Error('Failed to fetch');
      return resp.json();
    },
  });

  const notifications: any[] = data?.notifications || [];
  const total: number = data?.total || 0;
  const totalPages: number = data?.totalPages || 1;

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch(''); setSearchInput('');
    setFilterTargetType(''); setFilterNotifType(''); setFilterSenderRole('');
    setFilterFrom(''); setFilterTo('');
    setPage(1);
  };

  const hasFilters = search || filterTargetType || filterNotifType || filterSenderRole || filterFrom || filterTo;

  const getTypeBadge = (type: string) => {
    const conf = NOTIF_TYPES.find(t => t.value === type);
    if (!conf) return <Badge variant="outline">{type}</Badge>;
    const Icon = conf.icon;
    return (
      <Badge variant="outline" className={`${conf.color} border-current gap-1`}>
        <Icon className="h-3 w-3" />
        {conf.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex gap-2 flex-1 min-w-[200px]">
              <Input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Search title, message, recipient..."
                className="flex-1"
                data-testid="input-log-search"
              />
              <Button onClick={handleSearch} size="icon" variant="outline" data-testid="button-log-search">
                <Search className="h-4 w-4" />
              </Button>
            </div>

            <Select value={filterTargetType || 'all'} onValueChange={v => { setFilterTargetType(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-[160px]" data-testid="select-filter-target">
                <SelectValue placeholder="Recipient Group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Recipients</SelectItem>
                <SelectItem value="all_drivers">All Drivers</SelectItem>
                <SelectItem value="specific_driver">Specific Driver</SelectItem>
                <SelectItem value="all_customers">All Customers</SelectItem>
                <SelectItem value="specific_customer">Specific Customer</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterNotifType || 'all'} onValueChange={v => { setFilterNotifType(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="alert">Alert</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterSenderRole || 'all'} onValueChange={v => { setFilterSenderRole(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-sender">
                <SelectValue placeholder="Sent By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Senders</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                type="date"
                value={filterFrom}
                onChange={e => { setFilterFrom(e.target.value); setPage(1); }}
                className="w-[150px]"
                data-testid="input-filter-from"
              />
              <span className="text-muted-foreground text-sm">–</span>
              <Input
                type="date"
                value={filterTo}
                onChange={e => { setFilterTo(e.target.value); setPage(1); }}
                className="w-[150px]"
                data-testid="input-filter-to"
              />
            </div>

            {hasFilters && (
              <Button variant="outline" onClick={clearFilters} data-testid="button-clear-filters">
                Clear
              </Button>
            )}

            <Button size="icon" variant="outline" onClick={() => refetch()} data-testid="button-refresh-log">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Bell className="h-10 w-10 opacity-30" />
              <p className="text-sm">No notifications found</p>
              {hasFilters && <Button variant="outline" size="sm" onClick={clearFilters}>Clear Filters</Button>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Date / Time</TableHead>
                    <TableHead>Sender</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead className="w-[100px]">Type</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="w-[80px]">SMS</TableHead>
                    <TableHead className="w-[80px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.map((n: any) => (
                    <TableRow key={n.id} data-testid={`row-notification-${n.id}`}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {n.created_at ? format(new Date(n.created_at), 'dd MMM yyyy HH:mm') : '—'}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{n.sender_name || 'Admin'}</p>
                          <p className="text-xs text-muted-foreground capitalize">{n.sender_role || 'admin'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{TARGET_LABEL[n.target_type] || n.target_type}</p>
                          {n.target_user_name && (
                            <p className="text-xs text-muted-foreground">{n.target_user_name}</p>
                          )}
                          {parseInt(n.recipient_count) > 0 && (
                            <p className="text-xs text-muted-foreground">{n.recipient_count} recipients</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getTypeBadge(n.notification_type)}</TableCell>
                      <TableCell className="font-medium text-sm max-w-[160px]">
                        <span className="line-clamp-2">{n.title}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                        <span className="line-clamp-2">{n.message}</span>
                      </TableCell>
                      <TableCell>
                        {n.sms_sent ? (
                          <Badge variant="outline" className="text-green-600 border-green-600/30 text-xs gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {n.sms_sent_count > 0 ? n.sms_sent_count : ''}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-green-600 border-green-600/30 text-xs">
                          {n.status || 'sent'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {Math.min((page - 1) * 25 + 1, total)}–{Math.min(page * 25, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="flex items-center text-sm px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              data-testid="button-next-page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminNotifications() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground">Send notifications to drivers and customers</p>
          </div>
        </div>

        <Tabs defaultValue="send">
          <TabsList className="mb-6">
            <TabsTrigger value="send" data-testid="tab-send-notification">
              <Send className="h-4 w-4 mr-2" />
              Send Notification
            </TabsTrigger>
            <TabsTrigger value="log" data-testid="tab-notification-log">
              <List className="h-4 w-4 mr-2" />
              Notification Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="send">
            <SendNotificationTab />
          </TabsContent>

          <TabsContent value="log">
            <NotificationLogTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
