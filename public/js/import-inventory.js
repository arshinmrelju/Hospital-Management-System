import { getFirestore, collection, writeBatch, doc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

const auth = getAuth(window.firebaseApp);
const db = getFirestore(window.firebaseApp);

let authorized = false;

onAuthStateChanged(auth, (user) => {
  if (user) {
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists() && snap.data().role === 'Admin') {
        authorized = true;
        document.getElementById('startBtn').disabled = false;
        log('<span style="color:green">Authenticated as Admin — ready to import.</span>');
      } else {
        log('<span style="color:red">Access denied: Admin role required.</span>');
      }
    }).catch(() => {
      log('<span style="color:red">Could not verify credentials.</span>');
    });
  } else {
    log('<span style="color:red">Not authenticated. Please log in first.</span>');
    document.getElementById('startBtn').disabled = true;
  }
});

import { getDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

function log(msg) {
  const logEl = document.getElementById('log');
  logEl.innerHTML += `<div>${msg}</div>`;
  logEl.scrollTop = logEl.scrollHeight;
}

document.getElementById('startBtn').addEventListener('click', async () => {
  if (!authorized) {
    log('<span style="color:red">Unauthorized. Admin login required.</span>');
    return;
  }

  const btn = document.getElementById('startBtn');
  btn.disabled = true;
  btn.textContent = "Importing... Please wait";
  document.getElementById('progressWrap').style.display = 'block';

  log('Fetching inventory.csv...');
  try {
    const response = await fetch('inventory.csv');
    if (!response.ok) throw new Error('Could not find inventory.csv in the public folder');
    const csvText = await response.text();

    log('Parsing CSV...');
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: async function(results) {
        const data = results.data;
        log(`Parsed ${data.length} rows successfully.`);
        await uploadToFirestore(data);
      }
    });
  } catch (error) {
    log(`<span style="color:red">Error: ${error.message}</span>`);
    btn.disabled = false;
    btn.textContent = "Retry Import";
  }
});

async function uploadToFirestore(data) {
  const BATCH_SIZE = 450;
  let batches = [];
  let currentBatch = writeBatch(db);
  let operationCounter = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row.name || row.name.trim() === '') continue;

    const item = {
      itemNo: i + 1,
      brandName: row.name ? row.name.trim() : '',
      content: row.company ? row.company.trim() : '',
      batch: row.batch ? row.batch.trim() : '',
      purchaseDate: row.rec_date ? row.rec_date.trim() : '',
      mrp: row.mrp ? parseFloat(row.mrp) || 0 : 0,
      distributor: row.supplier ? row.supplier.trim() : '',
      expiry: row.exp ? row.exp.trim() : '',
      offer: '',
      tax: '',
      stock: row.stock ? parseFloat(row.stock) || 0 : 0,
      unit: row.unit ? row.unit.trim() : '',
      cost: row.cost ? parseFloat(row.cost) || 0 : 0,
      searchName: row.name ? row.name.toLowerCase() : '',
      addedAt: new Date().toISOString()
    };

    const docRef = doc(db, 'inventory', String(i + 1));
    currentBatch.set(docRef, item);
    operationCounter++;

    if (operationCounter === BATCH_SIZE) {
      batches.push(currentBatch);
      currentBatch = writeBatch(db);
      operationCounter = 0;
    }
  }

  if (operationCounter > 0) {
    batches.push(currentBatch);
  }

  log(`Prepared ${batches.length} batches. Starting upload...`);

  for (let i = 0; i < batches.length; i++) {
    try {
      await batches[i].commit();
      const progress = Math.round(((i + 1) / batches.length) * 100);
      document.getElementById('progressFill').style.width = `${progress}%`;
      log(`Committed batch ${i + 1} of ${batches.length} (${progress}%)`);
    } catch (e) {
      log(`<span style="color:red">Error on batch ${i+1}: ${e.message}</span>`);
    }
  }

  log('<span style="color:green"><b>Import Complete!</b></span>');
  document.getElementById('startBtn').textContent = "Import Completed";
}
