import { supabase } from '@/lib/supabase';
import { Platform } from 'react-native';

export type DocumentStatus = 'pending' | 'verified' | 'rejected' | 'not_uploaded' | 'approved';

export type DriverDocument = {
  id: string;
  driver_id: string;
  document_type: string;
  type?: string;
  file_url: string;
  url?: string;
  status: DocumentStatus;
  expiry_date?: string;
  metadata?: Record<string, any>;
  uploaded_at?: string;
  created_at?: string;
  updated_at?: string;
};

let cachedTableColumns: string[] | null = null;

async function getTableColumns(): Promise<string[]> {
  if (cachedTableColumns) return cachedTableColumns;
  
  try {
    const { data, error } = await supabase
      .from('driver_documents')
      .select('*')
      .limit(1);
    
    if (data && data.length > 0) {
      cachedTableColumns = Object.keys(data[0]);
      console.log('Detected driver_documents columns:', cachedTableColumns);
      return cachedTableColumns;
    }
    
    cachedTableColumns = ['id', 'driver_id', 'doc_type', 'file_url', 'status', 'expiry_date', 'uploaded_at', 'updated_at'];
    console.log('Using default columns:', cachedTableColumns);
    return cachedTableColumns;
  } catch (error) {
    console.log('Error detecting columns, using defaults');
    cachedTableColumns = ['id', 'driver_id', 'doc_type', 'file_url', 'status', 'expiry_date', 'uploaded_at', 'updated_at'];
    return cachedTableColumns;
  }
}

function filterToValidColumns(data: Record<string, any>, validColumns: string[]): Record<string, any> {
  const filtered: Record<string, any> = {};
  for (const key of Object.keys(data)) {
    if (validColumns.includes(key)) {
      filtered[key] = data[key];
    }
  }
  return filtered;
}

export type DocumentCategory = 'personal' | 'vehicle_photos' | 'insurance' | 'vehicle_details';

export type DocumentDefinition = {
  id: string;
  name: string;
  type: string;
  category: DocumentCategory;
  requiresExpiry: boolean;
  optional?: boolean;
  multiPhoto?: { count: number; labels: string[] };
  requiredFor?: {
    vehicleTypes?: string[];
    nationalityNotBritish?: boolean;
  };
};

export const DOCUMENT_DEFINITIONS: DocumentDefinition[] = [
  { id: 'dbs_certificate', name: 'DBS Certificate', type: 'dbs_certificate', category: 'personal', requiresExpiry: false },
  { id: 'driving_licence', name: 'Driving Licence', type: 'driving_licence', category: 'personal', requiresExpiry: true, multiPhoto: { count: 2, labels: ['Front', 'Back'] } },
  { id: 'share_code', name: 'Share Code (Right to Work)', type: 'share_code', category: 'personal', requiresExpiry: false, requiredFor: { nationalityNotBritish: true } },
  
  { id: 'vehicle_photos_basic', name: 'Vehicle Photos', type: 'vehicle_photos', category: 'vehicle_photos', requiresExpiry: false, multiPhoto: { count: 2, labels: ['Front', 'Back'] }, requiredFor: { vehicleTypes: ['motorbike', 'car'] } },
  { id: 'vehicle_photos_full', name: 'Vehicle Photos', type: 'vehicle_photos', category: 'vehicle_photos', requiresExpiry: false, multiPhoto: { count: 5, labels: ['Front', 'Back', 'Left', 'Right', 'Load Space'] }, requiredFor: { vehicleTypes: ['small_van', 'medium_van'] } },
  
  { id: 'mot_certificate', name: 'MOT Certificate', type: 'mot_certificate', category: 'vehicle_details', requiresExpiry: true, optional: true },
  
  { id: 'motorbike_insurance', name: 'Motorbike Insurance', type: 'motorbike_insurance', category: 'insurance', requiresExpiry: true, requiredFor: { vehicleTypes: ['motorbike'] } },
  { id: 'hire_and_reward', name: 'Hire & Reward Insurance', type: 'hire_and_reward', category: 'insurance', requiresExpiry: true },
  { id: 'goods_in_transit', name: 'Goods in Transit Insurance', type: 'goods_in_transit', category: 'insurance', requiresExpiry: true },
];

export function getRequiredDocuments(
  vehicleType: string,
  nationality: string
): DocumentDefinition[] {
  const isBritish = nationality?.toLowerCase() === 'british' || nationality?.toLowerCase() === 'uk';
  const normalizedVehicleType = vehicleType?.toLowerCase().replace(/ /g, '_') || 'car';
  
  console.log('getRequiredDocuments called with:', { vehicleType, nationality, normalizedVehicleType, isBritish });
  
  const result = DOCUMENT_DEFINITIONS.filter((doc) => {
    if (doc.requiredFor?.nationalityNotBritish && isBritish) {
      return false;
    }
    
    if (doc.requiredFor?.vehicleTypes) {
      if (!doc.requiredFor.vehicleTypes.includes(normalizedVehicleType)) {
        return false;
      }
    }
    
    return true;
  });
  
  console.log('Required documents:', result.map(d => d.name));
  return result;
}

function normalizeDocument(doc: any): DriverDocument {
  return {
    id: doc.id,
    driver_id: doc.driver_id,
    document_type: doc.doc_type || doc.document_type || doc.type || '',
    type: doc.doc_type || doc.type || doc.document_type || '',
    file_url: doc.file_url || doc.url || '',
    url: doc.url || doc.file_url || '',
    status: doc.status || 'not_uploaded',
    expiry_date: doc.expiry_date,
    metadata: doc.metadata,
    uploaded_at: doc.uploaded_at || doc.created_at,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };
}

function getDocumentType(doc: DriverDocument): string {
  return doc.document_type || doc.type || '';
}

export async function fetchDriverDocuments(driverId: string): Promise<DriverDocument[]> {
  try {
    const { data, error } = await supabase
      .from('driver_documents')
      .select('*')
      .eq('driver_id', driverId);

    if (error) {
      console.error('Error fetching documents:', error);
      return [];
    }

    return (data || []).map(normalizeDocument);
  } catch (error) {
    console.error('Error fetching documents:', error);
    return [];
  }
}

export async function uploadDocument(
  driverId: string,
  documentType: string,
  fileUri: string,
  expiryDate?: string,
  metadata?: Record<string, any>
): Promise<{ success: boolean; document?: DriverDocument; error?: string }> {
  try {
    // Get the authenticated user's ID for storage RLS compliance
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('[DOC UPLOAD] No authenticated user found');
      return { success: false, error: 'You must be logged in to upload documents. Please log in and try again.' };
    }
    const authUserId = user.id;
    console.log('[DOC UPLOAD] Auth user ID:', authUserId, 'Driver ID:', driverId);
    let fileData: ArrayBuffer;
    let contentType = 'image/jpeg';
    let fileExt = 'jpg';
    
    // Determine file extension from URI first
    const uriParts = fileUri.split('.');
    const lastPart = uriParts[uriParts.length - 1]?.toLowerCase().split('?')[0];
    if (lastPart && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'pdf'].includes(lastPart)) {
      fileExt = lastPart === 'jpeg' ? 'jpg' : lastPart;
      if (lastPart === 'png') contentType = 'image/png';
      else if (lastPart === 'gif') contentType = 'image/gif';
      else if (lastPart === 'webp') contentType = 'image/webp';
      else if (lastPart === 'heic') contentType = 'image/heic';
      else if (lastPart === 'pdf') contentType = 'application/pdf';
    }
    
    console.log('[DOC UPLOAD] Reading file from:', fileUri.substring(0, 100));
    
    // Pure JavaScript base64 to ArrayBuffer (Hermes compatible - no atob)
    const base64ToArrayBuffer = (base64String: string): ArrayBuffer => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const lookup = new Uint8Array(256);
      for (let i = 0; i < chars.length; i++) {
        lookup[chars.charCodeAt(i)] = i;
      }
      
      let bufferLength = base64String.length * 0.75;
      if (base64String[base64String.length - 1] === '=') bufferLength--;
      if (base64String[base64String.length - 2] === '=') bufferLength--;
      
      const arraybuffer = new ArrayBuffer(bufferLength);
      const bytes = new Uint8Array(arraybuffer);
      
      let p = 0;
      for (let i = 0; i < base64String.length; i += 4) {
        const encoded1 = lookup[base64String.charCodeAt(i)];
        const encoded2 = lookup[base64String.charCodeAt(i + 1)];
        const encoded3 = lookup[base64String.charCodeAt(i + 2)];
        const encoded4 = lookup[base64String.charCodeAt(i + 3)];
        
        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
        bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
        bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
      }
      
      return arraybuffer;
    };
    
    // Handle web platform (blob: URLs) vs native platform (file:// URLs)
    if (Platform.OS === 'web' && fileUri.startsWith('blob:')) {
      console.log('[DOC UPLOAD] Web platform detected, fetching blob URL');
      try {
        const response = await fetch(fileUri);
        const blob = await response.blob();
        fileData = await blob.arrayBuffer();
        
        // Get content type from blob if available
        if (blob.type) {
          contentType = blob.type;
          if (blob.type.includes('png')) fileExt = 'png';
          else if (blob.type.includes('gif')) fileExt = 'gif';
          else if (blob.type.includes('webp')) fileExt = 'webp';
          else if (blob.type.includes('pdf')) fileExt = 'pdf';
        }
        console.log('[DOC UPLOAD] Web blob loaded, size:', fileData.byteLength, 'type:', contentType);
      } catch (webError: any) {
        console.error('[DOC UPLOAD] Web blob fetch error:', webError);
        return { success: false, error: 'Failed to read selected file. Please try again.' };
      }
    } else {
      // Native platform - use expo-file-system
      const FileSystem = require('expo-file-system');
      const base64 = await FileSystem.readAsStringAsync(fileUri, { 
        encoding: FileSystem.EncodingType.Base64 
      });
      
      if (!base64) {
        console.error('[DOC UPLOAD] Failed to read file - base64 is empty');
        return { success: false, error: 'Failed to read file. Please try again.' };
      }
      
      fileData = base64ToArrayBuffer(base64);
    }
    
    const fileName = `${documentType}_${Date.now()}.${fileExt}`;
    // Use authUserId for storage path to comply with RLS policy (auth.uid() check)
    const filePath = `${authUserId}/${fileName}`;
    
    console.log('[DOC UPLOAD] Uploading to:', filePath, 'size:', fileData.byteLength, 'type:', contentType);

    const { error: uploadError } = await supabase.storage
      .from('DRIVER-DOCUMENTS')
      .upload(filePath, fileData, { 
        upsert: true,
        contentType: contentType
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      let errorMessage = 'Failed to upload file. Please try again.';
      if (uploadError.message?.includes('exceeded')) {
        errorMessage = 'File is too large. Please choose a smaller image.';
      } else if (uploadError.message?.includes('network') || uploadError.message?.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (uploadError.message?.includes('permission') || uploadError.message?.includes('policy')) {
        errorMessage = 'Upload not allowed. Please contact support.';
      }
      return { success: false, error: errorMessage };
    }

    const { data: urlData } = supabase.storage
      .from('DRIVER-DOCUMENTS')
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;

    // Check for existing doc using authUserId (for RLS compliance)
    const existingDoc = await getDocumentByType(authUserId, documentType);
    const validColumns = await getTableColumns();
    
    // Build document data with all possible column names
    // Use authUserId for driver_id to comply with RLS policy (driver_id = auth.uid())
    const allDocumentData: Record<string, any> = {
      driver_id: authUserId,
      doc_type: documentType,
      document_type: documentType,
      type: documentType,
      file_url: publicUrl,
      url: publicUrl,
      status: 'pending',
      expiry_date: expiryDate || null,
      updated_at: new Date().toISOString(),
    };
    
    // Filter to only include columns that exist in the table
    const documentData = filterToValidColumns(allDocumentData, validColumns);
    console.log('Using document data:', documentData);

    let result;
    if (existingDoc) {
      const { data, error } = await supabase
        .from('driver_documents')
        .update(documentData)
        .eq('id', existingDoc.id)
        .select()
        .single();
      
      if (error) {
        console.error('Error updating document:', error);
        return { success: false, error: `Failed to update document: ${error.message}` };
      }
      result = data;
    } else {
      const allInsertData: Record<string, any> = {
        ...allDocumentData,
        uploaded_at: new Date().toISOString(),
      };
      
      const insertData = filterToValidColumns(allInsertData, validColumns);
      console.log('Using insert data:', insertData);

      const { data, error } = await supabase
        .from('driver_documents')
        .insert(insertData)
        .select()
        .single();
      
      if (error) {
        console.error('Error inserting document:', error);
        return { success: false, error: `Failed to create document: ${error.message}` };
      }
      result = data;
    }

    return { success: true, document: result ? normalizeDocument(result) : undefined };
  } catch (error: any) {
    console.error('Upload document error:', error);
    return { success: false, error: error.message || 'Failed to upload document' };
  }
}

export async function getDocumentByType(
  driverId: string,
  documentType: string
): Promise<DriverDocument | null> {
  try {
    const { data: allDocs, error } = await supabase
      .from('driver_documents')
      .select('*')
      .eq('driver_id', driverId);

    if (error) {
      console.error('Error fetching documents:', error);
      return null;
    }

    if (!allDocs || allDocs.length === 0) {
      return null;
    }

    const matchingDoc = allDocs.find((doc: any) => 
      doc.doc_type === documentType || doc.document_type === documentType || doc.type === documentType
    );

    return matchingDoc ? normalizeDocument(matchingDoc) : null;
  } catch (error) {
    console.error('Error fetching document:', error);
    return null;
  }
}

export async function deleteDocument(documentId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('driver_documents')
      .delete()
      .eq('id', documentId);

    if (error) {
      console.error('Error deleting document:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting document:', error);
    return false;
  }
}

function findMatchingDocument(documents: DriverDocument[], reqDoc: DocumentDefinition): DriverDocument | undefined {
  return documents.find((d) => {
    const docType = getDocumentType(d);
    if (docType === reqDoc.type) return true;
    if (reqDoc.multiPhoto && docType.startsWith(reqDoc.type + '_')) return true;
    return false;
  });
}

export function calculateCompletionPercentage(
  documents: DriverDocument[],
  requiredDocuments: DocumentDefinition[]
): { verified: number; pending: number; total: number; percentage: number } {
  const nonOptionalDocs = requiredDocuments.filter(d => !d.optional);
  
  const verifiedCount = nonOptionalDocs.filter((reqDoc) => {
    const uploadedDoc = findMatchingDocument(documents, reqDoc);
    return uploadedDoc?.status === 'verified' || uploadedDoc?.status === 'approved';
  }).length;

  const pendingCount = nonOptionalDocs.filter((reqDoc) => {
    const uploadedDoc = findMatchingDocument(documents, reqDoc);
    return uploadedDoc?.status === 'pending';
  }).length;

  const total = nonOptionalDocs.length;
  const percentage = total > 0 ? Math.round((verifiedCount / total) * 100) : 0;

  return { verified: verifiedCount, pending: pendingCount, total, percentage };
}

export function getDocumentDisplayStatus(status?: string): {
  label: string;
  color: 'success' | 'warning' | 'error' | 'secondary';
} {
  switch (status) {
    case 'verified':
      return { label: 'Verified', color: 'success' };
    case 'pending':
      return { label: 'Pending Review', color: 'warning' };
    case 'rejected':
      return { label: 'Rejected', color: 'error' };
    default:
      return { label: 'Not Uploaded', color: 'secondary' };
  }
}
