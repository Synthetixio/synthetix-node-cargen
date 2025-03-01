import { car } from '@helia/car';
import { unixfs } from '@helia/unixfs';
import { CarWriter } from '@ipld/car';
import { createHelia } from 'helia';
import fs from 'node:fs/promises';
import path from 'node:path';

async function carWriterOutToBuffer(out) {
  const parts = [];
  for await (const part of out) {
    parts.push(part);
  }
  return Buffer.concat(parts);
}

async function getFilesRecursive(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? await getFilesRecursive(fullPath) : fullPath;
    })
  );
  return files.flat();
}


export async function generate(srcDir, dstDir) {
  if (!srcDir || !dstDir) {
    throw new Error('Missing arguments. Usage: node generateCarBlob.js <srcDir> <dstDir>');
  }

  const allFiles = await getFilesRecursive(srcDir);
  if (!allFiles.some((file) => file.endsWith('index.html'))) {
    throw new Error('Directory must contain an "index.html" file');
  }

  const inputFiles = await Promise.all(
    allFiles.map(async (file) => {
      return {
        path: file,
        content: new Uint8Array(await fs.readFile(file)),
      }
    })
  );

  const helia = await createHelia({ start: false });
  const heliaUnixfs = unixfs(helia);

  let rootCID = null;
  for await (const entry of heliaUnixfs.addAll(inputFiles)) {
    rootCID = entry.cid;
  }

  if (!rootCID) {
    throw new Error('Failed to generate rootCID from files');
  }

  const c = car(helia);
  const { writer, out } = await CarWriter.create(rootCID);
  const carBufferPromise = carWriterOutToBuffer(out);
  await c.export(rootCID, writer);
  const carBlob = await carBufferPromise;


  const fileName = `${rootCID.toString()}.car`
  const filePath = path.resolve(dstDir, fileName);
  await fs.rm(filePath, { recursive: true, force: true });
  await fs.writeFile(filePath, carBlob);
  return fileName;
}
