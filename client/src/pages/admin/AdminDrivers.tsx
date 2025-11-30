import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  MoreHorizontal,
  Eye,
  FileText,
  CheckCircle,
  XCircle,
  Star,
  Truck,
  Phone,
  Mail,
} from 'lucide-react';

const mockDrivers = [
  { id: 'd1', name: 'Mike Wilson', email: 'mike@driver.com', phone: '07700 900001', vehicle: 'Car', registration: 'AB12 CDE', verified: true, available: true, rating: 4.9, totalJobs: 234, documentsStatus: 'approved' },
  { id: 'd2', name: 'Tom Brown', email: 'tom@driver.com', phone: '07700 900002', vehicle: 'Motorbike', registration: 'CD34 EFG', verified: true, available: false, rating: 4.7, totalJobs: 156, documentsStatus: 'approved' },
  { id: 'd3', name: 'James Lee', email: 'james@driver.com', phone: '07700 900003', vehicle: 'Car', registration: 'EF56 GHI', verified: true, available: true, rating: 4.8, totalJobs: 189, documentsStatus: 'approved' },
  { id: 'd4', name: 'Sarah Miller', email: 'sarah@driver.com', phone: '07700 900004', vehicle: 'Small Van', registration: 'GH78 IJK', verified: false, available: false, rating: 0, totalJobs: 0, documentsStatus: 'pending' },
  { id: 'd5', name: 'Chris Evans', email: 'chris@driver.com', phone: '07700 900005', vehicle: 'Medium Van', registration: 'IJ90 KLM', verified: false, available: false, rating: 0, totalJobs: 0, documentsStatus: 'rejected' },
];

export default function AdminDrivers() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDrivers = mockDrivers.filter((driver) =>
    driver.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    driver.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Drivers Management</h1>
          <p className="text-muted-foreground">Manage and verify driver accounts</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{mockDrivers.length}</div>
              <p className="text-sm text-muted-foreground">Total Drivers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-500">
                {mockDrivers.filter(d => d.verified).length}
              </div>
              <p className="text-sm text-muted-foreground">Verified</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-500">
                {mockDrivers.filter(d => d.available).length}
              </div>
              <p className="text-sm text-muted-foreground">Available Now</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-500">
                {mockDrivers.filter(d => d.documentsStatus === 'pending').length}
              </div>
              <p className="text-sm text-muted-foreground">Pending Verification</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search drivers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-drivers"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Jobs</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDrivers.map((driver) => (
                  <TableRow key={driver.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            {driver.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{driver.name}</div>
                          <div className="text-xs text-muted-foreground">{driver.registration}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {driver.email}
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {driver.phone}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        {driver.vehicle}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {driver.verified ? (
                          <Badge className="bg-green-500 text-white w-fit">Verified</Badge>
                        ) : (
                          <Badge variant="secondary" className="w-fit">Unverified</Badge>
                        )}
                        {driver.available && (
                          <Badge className="bg-blue-500 text-white w-fit">Available</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {driver.rating > 0 ? (
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          <span>{driver.rating}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{driver.totalJobs}</TableCell>
                    <TableCell>
                      {driver.documentsStatus === 'approved' && (
                        <Badge className="bg-green-500 text-white">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Approved
                        </Badge>
                      )}
                      {driver.documentsStatus === 'pending' && (
                        <Badge className="bg-yellow-500 text-white">Pending</Badge>
                      )}
                      {driver.documentsStatus === 'rejected' && (
                        <Badge className="bg-red-500 text-white">
                          <XCircle className="h-3 w-3 mr-1" />
                          Rejected
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Eye className="mr-2 h-4 w-4" />
                            View Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <FileText className="mr-2 h-4 w-4" />
                            View Documents
                          </DropdownMenuItem>
                          {!driver.verified && (
                            <DropdownMenuItem className="text-green-600">
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Approve Driver
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
