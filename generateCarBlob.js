import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import { car } from '@helia/car';
import { CarWriter } from '@ipld/car';
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

async function clearAndCreateCarFilesDir() {
  const carFilesPath = path.resolve('car_files');
  try {
    await fs.rm(carFilesPath, { recursive: true, force: true });
  } catch {}
  await fs.mkdir(carFilesPath, { recursive: true });
}

async function generateCarBlob() {
  try {
    const directory = (
      await Promise.all(
        ['build', 'dist'].map(async (dir) =>
          (await fs.stat(dir).then(() => dir).catch(() => null))
        )
      )
    ).find(Boolean);

    if (!directory) {
      throw new Error('Both "build" and "dist" directories are missing');
    }

    const allFiles = await getFilesRecursive(directory);
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

    await clearAndCreateCarFilesDir();

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

    const filePath = path.resolve(`car_files/${rootCID.toString()}.car`);
    await fs.writeFile(filePath, carBlob);

    console.log(`CAR Blob generated at: ${filePath}`);
  } catch (error) {
    console.error('Error encountered:', error);
    process.exit(1);
  }
}

generateCarBlob();