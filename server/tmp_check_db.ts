import { db } from './db';
import { jobs } from '@shared/schema';
import { isNotNull, desc } from 'drizzle-orm';

async function main() {
  const recentJobs = await db.select({
    id: jobs.id,
    podPhotoUrl: jobs.podPhotoUrl
  })
  .from(jobs)
  .where(isNotNull(jobs.podPhotoUrl))
  .orderBy(desc(jobs.updatedAt))
  .limit(10);

  console.log("Recent jobs with PODs:");
  recentJobs.forEach(j => {
    console.log(`Job ${j.id}: ${j.podPhotoUrl}`);
  });
  process.exit(0);
}

main().catch(console.error);
