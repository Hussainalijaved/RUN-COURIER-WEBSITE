const url = "https://dkkuuxyejgxldvmwpdkf.supabase.co/storage/v1/object/public/pod/pod/345/3fa5801f-a896-4496-9a61-97d688c1bff0.jpg";

async function check() {
  try {
    const res = await fetch(url);
    console.log('Status:', res.status);
    console.log('Headers:', JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2));
    const buffer = await res.arrayBuffer();
    console.log('Body length:', buffer.byteLength);
    if (buffer.byteLength > 0) {
        console.log('First 20 bytes (hex):', Buffer.from(buffer.slice(0, 20)).toString('hex'));
        if (buffer.byteLength < 1000) {
            console.log('Body text:', new TextDecoder().decode(buffer));
        }
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

check();
