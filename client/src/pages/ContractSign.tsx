import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileSignature,
  CheckCircle,
  Loader2,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import logoImage from '@assets/run_courier_logo_opt.png';

export default function ContractSign() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signedName, setSignedName] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const { data: contract, isLoading, error } = useQuery<any>({
    queryKey: ['/api/contracts/sign', token],
    queryFn: async () => {
      const res = await fetch(`/api/contracts/sign/${token}`);
      if (!res.ok) throw new Error('Contract not found');
      return res.json();
    },
    enabled: !!token,
  });

  const signMutation = useMutation({
    mutationFn: async (data: { signatureData: string; signedName: string }) => {
      const res = await apiRequest('POST', `/api/contracts/sign/${token}`, data);
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
    },
  });

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    if (contract && contract.status !== 'signed') {
      setTimeout(initCanvas, 100);
    }
  }, [contract, initCanvas]);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  }

  function startDrawing(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  }

  function stopDrawing() {
    setIsDrawing(false);
  }

  function clearSignature() {
    setHasDrawn(false);
    initCanvas();
  }

  function handleSubmit() {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn || !signedName.trim()) return;
    const signatureData = canvas.toDataURL('image/png');
    signMutation.mutate({ signatureData, signedName: signedName.trim() });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-3xl">
          <CardContent className="py-12">
            <Skeleton className="h-8 w-48 mx-auto mb-4" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4 mb-2" />
            <Skeleton className="h-4 w-5/6" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-3" />
            <h2 className="text-lg font-semibold mb-2">Contract Not Found</h2>
            <p className="text-sm text-muted-foreground">This contract link may be invalid or has expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted || contract.status === 'signed') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-16 h-16 mx-auto text-green-600 mb-4" />
            <h2 className="text-xl font-semibold mb-2" data-testid="text-signed-confirmation">Contract Signed</h2>
            <p className="text-muted-foreground">
              Thank you, {contract.driverName || contract.signedName}. Your contract has been signed and recorded.
            </p>
            {contract.signedAt && (
              <p className="text-sm text-muted-foreground mt-2">
                Signed on {new Date(contract.signedAt).toLocaleDateString('en-GB')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src={logoImage} alt="Run Courier" className="h-8 w-8 rounded-md object-cover" />
          <span className="font-semibold">Run Courier</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-contract-title">Contract for Signing</h1>
          <p className="text-muted-foreground mt-1">
            Hi {contract.driverName}, please review the contract below and sign at the bottom.
          </p>
        </div>

        <Card>
          <CardContent className="py-6">
            <div className="whitespace-pre-wrap text-sm leading-relaxed" data-testid="text-contract-body">
              {contract.contractContent}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSignature className="w-5 h-5" />
              Sign Below
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="signed-name">Your Full Name</Label>
              <Input
                id="signed-name"
                value={signedName}
                onChange={(e) => setSignedName(e.target.value)}
                placeholder="Enter your full legal name"
                data-testid="input-signed-name"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Signature</Label>
                <Button size="sm" variant="ghost" onClick={clearSignature} data-testid="button-clear-signature">
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Clear
                </Button>
              </div>
              <div className="border rounded-md overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  className="w-full cursor-crosshair touch-none"
                  style={{ height: '160px' }}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  data-testid="canvas-signature"
                />
              </div>
              {!hasDrawn && (
                <p className="text-xs text-muted-foreground mt-1">Draw your signature using your mouse or finger</p>
              )}
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleSubmit}
              disabled={signMutation.isPending || !hasDrawn || !signedName.trim()}
              data-testid="button-submit-signature"
            >
              {signMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <FileSignature className="w-4 h-4 mr-1.5" />
              )}
              Sign & Submit Contract
            </Button>

            {signMutation.isError && (
              <p className="text-sm text-destructive text-center" data-testid="text-sign-error">
                Failed to submit signature. Please try again.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
