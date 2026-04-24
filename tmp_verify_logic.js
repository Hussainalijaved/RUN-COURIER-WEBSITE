// Mock resolveUrl logic for verification
function resolveUrlMock(path) {
  if (!path) return path;
  
  let storagePath = path;
  let targetBucket = 'pod-images';

  if (path.startsWith('http')) {
    const match = path.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^\/]+)\/(.+?)(?:\?.*)?$/);
    if (match) {
      targetBucket = match[1];
      storagePath = match[2].split('?')[0];
    } else {
      return path;
    }
  }

  if (storagePath.includes('?')) {
    storagePath = storagePath.split('?')[0];
  }

  return { storagePath, targetBucket };
}

const input1 = "https://dkkuuxyejgxldvmwpdkf.supabase.co/storage/v1/object/sign/pod/pod/345/3fa5801f-a896-4496-9a61-97d688c1bff0.jpg?token=abc";
const input2 = "pod/345/xyz.jpg";
const input3 = "https://dkkuuxyejgxldvmwpdkf.supabase.co/storage/v1/object/public/pod-images/job_123/img.jpg";

console.log("Input 1:", JSON.stringify(resolveUrlMock(input1)));
console.log("Input 2:", JSON.stringify(resolveUrlMock(input2)));
console.log("Input 3:", JSON.stringify(resolveUrlMock(input3)));
