const url = "https://dkkuuxyejgxldvmwpdkf.supabase.co/storage/v1/object/sign/pod/pod/345/3fa5801f-a896-4496-9a61-97d688c1bff0.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82MzhjNjZmMi01Y2NmLTQxODAtOTQ5ZS1mYmQ5NmRkMzcyMzQiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwb2QvcG9kLzM0NS8zZmE1ODAxZi1hODk2LTQ0OTYtOWE2MS05N2Q2ODhjMWJmZjAuanBnIiwiaWF0IjoxNzc3MDIzOTE5LCJleHAiOjE3NzcwMjc1MTl9.GXIfydoJbJ1xyyziclZv868-vpH3kAR3PaZfSS3KXJY";

async function check() {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    console.log('Status:', res.status);
    console.log('Headers:', JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2));
    if (res.status !== 200) {
        const body = await (await fetch(url)).text();
        console.log('Body:', body);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

check();
