import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  indexFile,
  reindexFile,
  search,
  formatSearchResults,
  getStatus,
} from './src/rag';

dotenv.config();

// デフォルトでプリウス取扱説明書を使用
const DEFAULT_DATA_FILE = path.join(
  __dirname,
  '..',
  'assets',
  'instruction-manual',
  'prius-instruction-manual.txt'
);

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    printUsage();
    process.exit(1);
  }

  try {
    switch (command) {
      case 'init':
        await handleInit(args.slice(1));
        break;
      case 'reindex':
        await handleReindex(args.slice(1));
        break;
      case 'query':
        await handleQuery(args.slice(1));
        break;
      case 'status':
        await handleStatus();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

function printUsage() {
  console.log(`
Usage: npx ts-node index.ts <command> [options]

Commands:
  init [file]      Initialize the database with text data
                   Default file: data/manual.txt

  reindex [file]   Reset and re-index the database
                   Default file: data/manual.txt

  query "<text>"   Search for relevant text
                   Example: npx ts-node index.ts query "エンジンの場所は？"

  status           Show database status

Examples:
  npx ts-node index.ts init
  npx ts-node index.ts init ./my-manual.txt
  npx ts-node index.ts query "ブレーキの使い方"
  npx ts-node index.ts status
`);
}

async function handleInit(args: string[]) {
  const filePath = args[0] || DEFAULT_DATA_FILE;
  console.log(`Initializing with file: ${filePath}`);

  const status = await getStatus();
  if (status.documentCount > 0) {
    console.log(
      `Database already contains ${status.documentCount} documents.`
    );
    console.log('Use "reindex" command to reset and re-index.');
    return;
  }

  const count = await indexFile(filePath);
  console.log(`Successfully indexed ${count} chunks.`);
}

async function handleReindex(args: string[]) {
  const filePath = args[0] || DEFAULT_DATA_FILE;
  console.log(`Re-indexing with file: ${filePath}`);

  const count = await reindexFile(filePath);
  console.log(`Successfully re-indexed ${count} chunks.`);
}

async function handleQuery(args: string[]) {
  const queryText = args.join(' ');

  if (!queryText) {
    console.error('Please provide a query text.');
    console.error('Example: npx ts-node index.ts query "エンジンの場所は？"');
    process.exit(1);
  }

  const result = await search(queryText, { topK: 5 });
  console.log('\n' + formatSearchResults(result));
}

async function handleStatus() {
  const status = await getStatus();
  console.log('\nDatabase Status:');
  console.log(`  Vector DB documents: ${status.documentCount}`);
  console.log(`  BM25 index documents: ${status.bm25DocumentCount}`);
}

main();
