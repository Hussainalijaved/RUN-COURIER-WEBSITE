import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export function useRealtimeDocuments() {
  const { toast } = useToast();

  useEffect(() => {
    const channel = supabase
      .channel('documents-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documents',
        },
        (payload) => {
          console.log('[Realtime] Document change detected:', payload.eventType, payload.new);
          
          queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
          
          if (payload.eventType === 'INSERT') {
            const newDoc = payload.new as { type?: string; file_name?: string };
            const docType = newDoc.type?.replace(/_/g, ' ') || 'document';
            toast({
              title: 'New Document Uploaded',
              description: `A ${docType} has been uploaded and is pending review`,
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedDoc = payload.new as { status?: string; type?: string };
            const oldDoc = payload.old as { status?: string };
            
            if (updatedDoc.status !== oldDoc?.status) {
              const docType = updatedDoc.type?.replace(/_/g, ' ') || 'document';
              toast({
                title: 'Document Status Updated',
                description: `A ${docType} is now ${updatedDoc.status}`,
              });
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Documents subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast]);
}
