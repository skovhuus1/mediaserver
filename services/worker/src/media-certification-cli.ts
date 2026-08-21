import { PrismaClient } from '@prisma/client';
import { runMediaCertification, type MediaCertificationOptions } from './media-certification.js';

const prisma = new PrismaClient();

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positiveInteger(name: string): number | undefined {
  const value = argumentValue(name);
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log([
      'BoltBytes media compatibility certification',
      '',
      'Options:',
      '  --account-id <uuid>       Restrict inventory to one account',
      '  --max-samples <1-100>     Runtime sample limit (default 24)',
      '  --seconds <1-15>          Decode duration per sample (default 3)',
      '  --concurrency <1-4>       Parallel samples (default 1)',
      '  --inventory-limit <n>     Limit database inventory (default 5000)',
      '  --output <directory>      Report directory (default /app/data/certification)',
      '  --no-transcode            Skip software-encode samples',
    ].join('\n'));
    return;
  }
  const accountId = argumentValue('--account-id');
  const maxSamples = positiveInteger('--max-samples');
  const decodeSeconds = positiveInteger('--seconds');
  const sampleConcurrency = positiveInteger('--concurrency');
  const inventoryLimit = positiveInteger('--inventory-limit');
  const outputDirectory = argumentValue('--output');
  const options: MediaCertificationOptions = {
    ...(accountId ? { accountId } : {}),
    ...(maxSamples ? { maxSamples } : {}),
    ...(decodeSeconds ? { decodeSeconds } : {}),
    ...(sampleConcurrency ? { sampleConcurrency } : {}),
    ...(inventoryLimit ? { inventoryLimit } : {}),
    ...(outputDirectory ? { outputDirectory } : {}),
    includeTranscode: !process.argv.includes('--no-transcode'),
  };
  const { report, jsonPath, markdownPath } = await runMediaCertification(prisma, options);
  console.log(JSON.stringify({
    component: 'media-certification',
    status: report.summary.failedSamples ? 'failed' : 'passed',
    inventory: report.inventory,
    summary: report.summary,
    jsonPath,
    markdownPath,
  }, null, 2));
  if (report.summary.failedSamples) process.exitCode = 1;
}

void main()
  .catch((error: unknown) => {
    console.error(JSON.stringify({
      component: 'media-certification',
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown certification failure',
    }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
