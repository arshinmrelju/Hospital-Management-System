import { getFirestore, collection, writeBatch, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

const auth = getAuth(window.firebaseApp);
const db = getFirestore(window.firebaseApp);

let authorized = false;

onAuthStateChanged(auth, (user) => {
  if (user) {
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists() && (snap.data().role === 'Admin' || snap.data().role === 'Staff')) {
        authorized = true;
        document.getElementById('startBtn').disabled = false;
        log('<span style="color:green">Authenticated successfully — ready to import.</span>');
      } else {
        log('<span style="color:red">Access denied: Admin or Staff role required.</span>');
      }
    }).catch(() => {
      log('<span style="color:red">Could not verify credentials.</span>');
    });
  } else {
    log('<span style="color:red">Not authenticated. Please log in first.</span>');
    document.getElementById('startBtn').disabled = true;
  }
});

function log(msg) {
  const logEl = document.getElementById('log');
  logEl.innerHTML += `<div>${msg}</div>`;
  logEl.scrollTop = logEl.scrollHeight;
}

document.getElementById('startBtn').addEventListener('click', async () => {
  if (!authorized) {
    log('<span style="color:red">Unauthorized. Admin/Staff login required.</span>');
    return;
  }

  const btn = document.getElementById('startBtn');
  btn.disabled = true;
  btn.textContent = "Importing... Please wait";
  document.getElementById('progressWrap').style.display = 'block';

  log('Fetching Patients.xlsx...');
  try {
    const response = await fetch('Patients.xlsx');
    if (!response.ok) throw new Error('Could not find Patients.xlsx in the public folder');
    const arrayBuffer = await response.arrayBuffer();

    log('Parsing Excel...');
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet);

    log(`Parsed ${rawRows.length} rows successfully.`);
    await uploadToFirestore(rawRows);
  } catch (error) {
    log(`<span style="color:red">Error: ${error.message}</span>`);
    btn.disabled = false;
    btn.textContent = "Retry Import";
  }
});

async function uploadToFirestore(rows) {
  const BATCH_SIZE = 450;
  let batches = [];
  let currentBatch = writeBatch(db);
  let operationCounter = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    const name = row['Name'] ? String(row['Name']).trim() : '';
    if (!name) continue;

    // Split Name into first name and last name
    const nameParts = name.split(/\s+/);
    const fname = nameParts[0] || '';
    const lname = nameParts.slice(1).join(' ') || 'Patient';

    // Parse date of birth if possible, otherwise construct from age
    const age = parseInt(row['Age']) || 0;
    let dobStr = '';
    if (age > 0) {
      const birthYear = new Date().getFullYear() - age;
      dobStr = `${birthYear}-01-01`;
    }

    // Map Category to Admission Type / type
    const category = row['Category'] ? String(row['Category']).trim().toLowerCase() : '';
    const type = (category === 'admitted' || category === 'inpatient') ? 'admitted' : 'outpatient';

    // Map Date to lastVisit (DD-MM-YYYY to YYYY-MM-DD)
    let lastVisit = new Date().toISOString().slice(0, 10);
    if (row['Date']) {
      const parts = String(row['Date']).split('-');
      if (parts.length === 3) {
        lastVisit = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }

    // Consolidated notes
    let notesArr = [];
    if (row['Remarks']) notesArr.push(`Remarks: ${row['Remarks']}`);
    if (row['Remark ']) notesArr.push(`Notes: ${row['Remark ']}`);
    if (row['Diabetic Dtls']) notesArr.push(`Diabetic Details: ${row['Diabetic Dtls']}`);
    if (row['Allergy']) notesArr.push(`Allergies: ${row['Allergy']}`);
    if (row['BP'] && row['BP'] !== 0 && row['BP'] !== '0') notesArr.push(`BP: ${row['BP']}`);
    if (row['Temprature'] && row['Temprature'] !== 0 && row['Temprature'] !== '0') notesArr.push(`Temp: ${row['Temprature']}°F`);
    if (row['Place']) notesArr.push(`Place: ${row['Place']}`);
    if (row['Doctor']) notesArr.push(`Doctor: ${row['Doctor']}`);
    if (row['Hosp. OP No']) notesArr.push(`OP No: ${row['Hosp. OP No']}`);
    const notes = notesArr.join('\n');

    // Default status to stable, or mapping if present
    const statusVal = row['Status'] ? String(row['Status']).trim().toLowerCase() : 'stable';
    const status = ['stable', 'recovering', 'critical'].includes(statusVal) ? statusVal : 'stable';

    const patient = {
      fname: fname,
      lname: lname,
      contact: row['Phone'] ? String(row['Phone']).trim() : 'Unknown',
      email: row['Email'] ? String(row['Email']).trim() : '',
      dept: row['Department'] ? String(row['Department']).trim() : 'General Surgery',
      type: type,
      blood: row['Blood Group'] ? String(row['Blood Group']).trim() : 'Unknown',
      notes: notes,
      status: status,
      age: age,
      dob: dobStr,
      lastVisit: lastVisit,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Use custom ID from Hosp. OP No or let firestore generate it. Let's auto-generate doc ID.
    const docRef = doc(collection(db, 'patients'));
    currentBatch.set(docRef, patient);
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
