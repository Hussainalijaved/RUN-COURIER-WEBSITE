-- Run this SQL in your Supabase SQL Editor to create the driver_documents table

-- Create the driver_documents table
CREATE TABLE IF NOT EXISTS driver_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL,
  type TEXT NOT NULL,
  url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('not_uploaded', 'pending', 'verified', 'rejected', 'expired')),
  expiry_date TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries by driver_id
CREATE INDEX IF NOT EXISTS idx_driver_documents_driver_id ON driver_documents(driver_id);

-- Create index for faster queries by type
CREATE INDEX IF NOT EXISTS idx_driver_documents_type ON driver_documents(type);

-- Create unique constraint to prevent duplicate document types per driver
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_documents_unique ON driver_documents(driver_id, type);

-- Enable Row Level Security (RLS)
ALTER TABLE driver_documents ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to view their own documents
CREATE POLICY "Users can view their own documents" ON driver_documents
  FOR SELECT
  USING (auth.uid() = driver_id);

-- Create policy to allow authenticated users to insert their own documents
CREATE POLICY "Users can insert their own documents" ON driver_documents
  FOR INSERT
  WITH CHECK (auth.uid() = driver_id);

-- Create policy to allow authenticated users to update their own documents
CREATE POLICY "Users can update their own documents" ON driver_documents
  FOR UPDATE
  USING (auth.uid() = driver_id);

-- Create policy to allow authenticated users to delete their own documents
CREATE POLICY "Users can delete their own documents" ON driver_documents
  FOR DELETE
  USING (auth.uid() = driver_id);

-- Also create the storage bucket if it doesn't exist
-- Note: You may need to create this in Storage section of Supabase dashboard
-- Bucket name: driver-documents

-- Grant public access to the storage bucket for viewing uploaded documents
-- Run these in Storage > Policies in Supabase dashboard:
-- INSERT: Allow authenticated users to upload
-- SELECT: Allow public to view (or authenticated only if you prefer)
-- UPDATE: Allow authenticated users to update their files
-- DELETE: Allow authenticated users to delete their files
