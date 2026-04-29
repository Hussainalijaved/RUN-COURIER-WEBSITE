import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PODUploadRequest {
  jobId: string
  photos?: string[]  // Array of base64 encoded images
  signature?: string // Base64 encoded signature image
  recipientName?: string
  notes?: string
}

// Generate a simple UUID
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// Decode base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  // Remove data URL prefix if present
  let base64String = base64
  if (base64.includes(',')) {
    base64String = base64.split(',')[1]
  }

  const binaryString = atob(base64String)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

// Get content type from base64 data URL
function getContentType(base64: string): string {
  if (base64.startsWith('data:')) {
    const match = base64.match(/data:([^;]+);/)
    if (match) {
      return match[1]
    }
  }
  return 'image/jpeg'
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with user's auth
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: PODUploadRequest = await req.json()
    const { jobId, photos, signature, recipientName, notes } = body

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: 'Job ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[upload-pod] Processing POD for job ${jobId}`)
    console.log(`[upload-pod] Photos: ${photos?.length || 0}, Signature: ${!!signature}`)

    // Verify the job exists and belongs to this driver
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, driver_id, status')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: 'Job not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify driver owns this job
    if (job.driver_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'This job is not assigned to you' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify job is in correct status for POD upload
    const validStatuses = ['on_the_way', 'on_the_way_delivery', 'picked_up', 'delivered']
    if (!validStatuses.includes(job.status)) {
      return new Response(
        JSON.stringify({
          error: 'POD can only be uploaded during delivery phase',
          currentStatus: job.status
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const uploadedPhotoUrls: string[] = []
    let signatureUrl: string | undefined

    // Upload photos to Supabase Storage
    if (photos && photos.length > 0) {
      console.log(`[upload-pod] Uploading ${photos.length} photos...`)

      for (let i = 0; i < photos.length; i++) {
        const photoBase64 = photos[i]
        if (!photoBase64) continue

        try {
          const uuid = generateUUID()
          const contentType = getContentType(photoBase64)
          const extension = contentType === 'image/png' ? 'png' : 'jpg'
          const filePath = `job_${jobId}/${uuid}.${extension}`

          const photoBytes = base64ToUint8Array(photoBase64)

          console.log(`[upload-pod] Uploading photo ${i + 1}: ${filePath} (${photoBytes.length} bytes)`)

          const { data, error: uploadError } = await supabase.storage
            .from('pod-images')
            .upload(filePath, photoBytes, {
              contentType,
              upsert: true
            })

          if (uploadError) {
            console.error(`[upload-pod] Photo ${i + 1} upload failed:`, uploadError)
            continue
          }

          const { data: urlData } = supabase.storage
            .from('pod-images')
            .getPublicUrl(filePath)

          uploadedPhotoUrls.push(urlData.publicUrl)
          console.log(`[upload-pod] Photo ${i + 1} uploaded: ${urlData.publicUrl}`)
        } catch (photoErr) {
          console.error(`[upload-pod] Error processing photo ${i + 1}:`, photoErr)
        }
      }
    }

    // Upload signature if provided
    if (signature) {
      try {
        const uuid = generateUUID()
        const contentType = getContentType(signature)
        const extension = contentType === 'image/png' ? 'png' : 'jpg'
        const filePath = `job_${jobId}/signature_${uuid}.${extension}`

        const signatureBytes = base64ToUint8Array(signature)

        console.log(`[upload-pod] Uploading signature: ${filePath} (${signatureBytes.length} bytes)`)

        const { data, error: uploadError } = await supabase.storage
          .from('pod-images')
          .upload(filePath, signatureBytes, {
            contentType,
            upsert: true
          })

        if (uploadError) {
          console.error(`[upload-pod] Signature upload failed:`, uploadError)
        } else {
          const { data: urlData } = supabase.storage
            .from('pod-images')
            .getPublicUrl(filePath)

          signatureUrl = urlData.publicUrl
          console.log(`[upload-pod] Signature uploaded: ${signatureUrl}`)
        }
      } catch (sigErr) {
        console.error(`[upload-pod] Error processing signature:`, sigErr)
      }
    }

    // Update job record with POD data
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (uploadedPhotoUrls.length > 0) {
      updateData.pod_photo_url = uploadedPhotoUrls[0]
      updateData.pod_photos = uploadedPhotoUrls
    }
    if (signatureUrl) {
      updateData.pod_signature_url = signatureUrl
    }
    if (recipientName) {
      updateData.recipient_name = recipientName
    }
    if (notes) {
      updateData.pod_notes = notes
    }

    const { error: updateError } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', jobId)

    if (updateError) {
      console.error(`[upload-pod] Failed to update job:`, updateError)
      return new Response(
        JSON.stringify({
          error: 'Failed to save POD data',
          details: updateError.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Also sync to customer_bookings if linked
    try {
      const { data: booking } = await supabase
        .from('customer_bookings')
        .select('id')
        .eq('driver_job_id', jobId)
        .single()

      if (booking) {
        const bookingUpdate: any = { updated_at: new Date().toISOString() }
        if (uploadedPhotoUrls.length > 0) {
          bookingUpdate.pod_photo_url = uploadedPhotoUrls[0]
          bookingUpdate.pod_photos = uploadedPhotoUrls
        }
        if (signatureUrl) {
          bookingUpdate.pod_signature_url = signatureUrl
        }
        if (recipientName) {
          bookingUpdate.recipient_name = recipientName
        }
        if (notes) {
          bookingUpdate.pod_notes = notes
        }

        await supabase
          .from('customer_bookings')
          .update(bookingUpdate)
          .eq('id', booking.id)

        console.log(`[upload-pod] Synced POD to customer booking ${booking.id}`)
      }
    } catch (syncErr) {
      console.log(`[upload-pod] No linked customer booking or sync failed`)
    }

    console.log(`[upload-pod] POD upload complete for job ${jobId}`)

    return new Response(
      JSON.stringify({
        success: true,
        photos: uploadedPhotoUrls,
        signature: signatureUrl,
        message: `Uploaded ${uploadedPhotoUrls.length} photos${signatureUrl ? ' and signature' : ''}`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[upload-pod] Unexpected error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
