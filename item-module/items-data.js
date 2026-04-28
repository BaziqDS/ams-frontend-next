/* ============================================================
   NED AMS — Items module data
   ============================================================ */

window.ITEMS = [
  {
    id: 'ITM-0142',
    code: 'IT-PRT-0142',
    name: 'HP LaserJet Pro M404dn — Monochrome Printer',
    category: 'IT Equipment / Printers',
    tracking: 'individual',
    unit: 'unit',
    minStock: 8,
    totalQty: 47,
    locationCount: 6,
    spec: 'Duplex · USB / Ethernet · 1200 dpi',
    mfg: 'HP Inc.',
    lastMovement: '2 days ago',
    deployed: 38,
    idle: 7,
    repair: 2,
    price: 'PKR 78,500',
    description: 'Standard departmental laser printer. Allocated under IT capex 2024–25.',
    locations: [
      {
        id: 'cs-dept', code: 'L-CS-001', name: 'Computer Science Department', kind: 'standalone',
        qty: 14, deployed: 11, allocated: 1, idle: 2,
        children: [
          {
            id: 'cs-main-store', code: 'L-CS-S-01', name: 'CS Main Store', kind: 'sub-store',
            qty: 4, idle: 4, deployed: 0,
            instances: [
              { tag: 'CS-PRT-001', name: 'M404dn (idle)', status: 'idle', meta: 'Bin C-2 · since 12 Mar' },
              { tag: 'CS-PRT-002', name: 'M404dn (idle)', status: 'idle', meta: 'Bin C-2 · since 12 Mar' },
              { tag: 'CS-PRT-031', name: 'M404dn (spare)', status: 'idle', meta: 'Bin C-3 · since 02 Apr' },
              { tag: 'CS-PRT-032', name: 'M404dn (spare)', status: 'idle', meta: 'Bin C-3 · since 02 Apr' },
            ]
          },
          {
            id: 'cs-fac-rooms', code: 'L-CS-F-12', name: 'Faculty Office Rooms', kind: 'sub-location',
            qty: 7, deployed: 7,
            children: [
              { id: 'cs-r-201', code: 'R-201', name: 'Room 201 — Dr. A. Khan', kind: 'leaf-room', qty: 1, deployed: 1, instance: { tag: 'CS-PRT-011', name: 'M404dn — assigned to A. Khan', status: 'in-use', meta: 'Deployed 14 Jan 2026' } },
              { id: 'cs-r-203', code: 'R-203', name: 'Room 203 — Dr. F. Siddiqui', kind: 'leaf-room', qty: 1, deployed: 1, instance: { tag: 'CS-PRT-012', name: 'M404dn — assigned to F. Siddiqui', status: 'in-use', meta: 'Deployed 14 Jan 2026' } },
              { id: 'cs-r-205', code: 'R-205', name: 'Room 205 — Dr. M. Hassan', kind: 'leaf-room', qty: 1, deployed: 1, instance: { tag: 'CS-PRT-013', name: 'M404dn — assigned to M. Hassan', status: 'in-use', meta: 'Deployed 14 Jan 2026' } },
              { id: 'cs-r-207', code: 'R-207', name: 'Room 207 — Dr. R. Ahmed', kind: 'leaf-room', qty: 1, deployed: 1, instance: { tag: 'CS-PRT-014', name: 'M404dn — assigned to R. Ahmed', status: 'in-use', meta: 'Deployed 19 Jan 2026' } },
              { id: 'cs-r-209', code: 'R-209', name: 'Room 209 — Dr. S. Khan', kind: 'leaf-room', qty: 1, deployed: 1, instance: { tag: 'CS-PRT-015', name: 'M404dn — assigned to S. Khan', status: 'in-use', meta: 'Deployed 19 Jan 2026' } },
              { id: 'cs-r-211', code: 'R-211', name: 'Room 211 — Dr. T. Mahmood', kind: 'leaf-room', qty: 1, deployed: 1, instance: { tag: 'CS-PRT-016', name: 'M404dn — assigned to T. Mahmood', status: 'in-use', meta: 'Deployed 22 Jan 2026' } },
              { id: 'cs-r-215', code: 'R-215', name: 'Room 215 — HOD Office', kind: 'leaf-room', qty: 1, deployed: 1, instance: { tag: 'CS-PRT-017', name: 'M404dn — HOD Office', status: 'in-use', meta: 'Deployed 22 Jan 2026' } },
            ]
          },
          {
            id: 'cs-allocated', code: 'PERSON', name: 'Allocated to persons', kind: 'persons',
            qty: 1, allocated: 1,
            persons: [
              { person: 'Asst. Prof. M. Bilal', tag: 'CS-PRT-021', allocated: '11 Mar 2026', meta: 'Take-home for fieldwork' },
            ]
          },
          {
            id: 'cs-repair', code: 'REPAIR', name: 'Awaiting repair', kind: 'repair',
            qty: 2, repair: 2,
            instances: [
              { tag: 'CS-PRT-008', name: 'M404dn — paper jam fault', status: 'repair', meta: 'Sent to vendor · 18 Apr' },
              { tag: 'CS-PRT-018', name: 'M404dn — fuser replacement', status: 'repair', meta: 'In-house repair · 22 Apr' },
            ]
          },
        ]
      },
      {
        id: 'ee-dept', code: 'L-EE-001', name: 'Electrical Engineering Department', kind: 'standalone',
        qty: 10, deployed: 9, idle: 1,
        children: [
          { id: 'ee-store', code: 'L-EE-S', name: 'EE Store', kind: 'sub-store', qty: 1, idle: 1 },
          { id: 'ee-rooms', code: 'L-EE-F', name: 'Faculty Rooms', kind: 'sub-location', qty: 9, deployed: 9 },
        ]
      },
      {
        id: 'civil-dept', code: 'L-CE-001', name: 'Civil Engineering Department', kind: 'standalone',
        qty: 8, deployed: 6, idle: 2,
      },
      {
        id: 'mech-dept', code: 'L-ME-001', name: 'Mechanical Engineering Department', kind: 'standalone',
        qty: 7, deployed: 6, idle: 1,
      },
      {
        id: 'central-store', code: 'L-CEN-MAIN', name: 'Central Store · Main', kind: 'standalone',
        qty: 6, idle: 6,
        children: [
          { id: 'cen-bin-a', code: 'BIN-A-2', name: 'Bin A-2-08', kind: 'sub-store', qty: 4, idle: 4 },
          { id: 'cen-bin-b', code: 'BIN-B-1', name: 'Bin B-1-15', kind: 'sub-store', qty: 2, idle: 2 },
        ]
      },
      {
        id: 'admin-block', code: 'L-ADM-001', name: 'Administration Block', kind: 'standalone',
        qty: 2, deployed: 2,
      },
    ],
    activity: [
      { kind: 'in', text: '<strong>Stock entry SE-2026-00184</strong> received 6 units from Central Store', meta: '22 Apr 2026' },
      { kind: 'out', text: '<strong>Issue voucher SE-2026-00179</strong> sent 2 units to CE Dept', meta: '20 Apr 2026' },
      { kind: 'move', text: '<strong>CS-PRT-018</strong> moved to repair queue (fuser fault)', meta: '22 Apr 2026' },
      { kind: 'in', text: 'Inspection certificate <strong>IC-2026-0341</strong> approved', meta: '18 Apr 2026' },
      { kind: 'out', text: '<strong>CS-PRT-021</strong> allocated to Asst. Prof. M. Bilal', meta: '11 Mar 2026' },
    ]
  },

  // ----- A QUANTITY-tracked item -----
  {
    id: 'ITM-0271',
    code: 'STA-PAP-A4',
    name: 'A4 Photocopy Paper — 80gsm, 500 sheets/ream',
    category: 'Stationery / Paper',
    tracking: 'quantity',
    unit: 'reams',
    minStock: 200,
    totalQty: 1240,
    locationCount: 12,
    spec: '80 gsm · A4 · white · ISO brightness 96',
    mfg: 'Packages Ltd.',
    lastMovement: 'Today',
    price: 'PKR 1,150 / ream',
    description: 'Standard departmental copier paper. Bulk-procured quarterly.',
    locations: [
      { id: 'cen-paper', code: 'L-CEN-MAIN', name: 'Central Store · Main', kind: 'standalone', qty: 820,
        children: [
          { id: 'cen-rack-paper', code: 'RACK-P-12', name: 'Rack P-12 (pallet)', kind: 'sub-store', qty: 820 },
        ] },
      { id: 'cs-paper', code: 'L-CS-001', name: 'Computer Science Department', kind: 'standalone', qty: 80 },
      { id: 'ee-paper', code: 'L-EE-001', name: 'Electrical Engineering Department', kind: 'standalone', qty: 110 },
      { id: 'civil-paper', code: 'L-CE-001', name: 'Civil Engineering Department', kind: 'standalone', qty: 90 },
      { id: 'mech-paper', code: 'L-ME-001', name: 'Mechanical Engineering Department', kind: 'standalone', qty: 75 },
      { id: 'admin-paper', code: 'L-ADM-001', name: 'Administration Block', kind: 'standalone', qty: 65 },
    ],
    activity: [
      { kind: 'out', text: 'Issued <strong>40 reams</strong> to CS Dept', meta: 'Today' },
      { kind: 'in', text: 'Received <strong>500 reams</strong> from Packages Ltd.', meta: '21 Apr 2026' },
    ]
  },

  // ----- A PERISHABLE item -----
  {
    id: 'ITM-0508',
    code: 'CHM-ETH-99',
    name: 'Ethanol — 99.9% Anhydrous (Lab Grade)',
    category: 'Chemicals / Solvents',
    tracking: 'perishable',
    unit: 'L',
    minStock: 40,
    totalQty: 124,
    locationCount: 4,
    spec: '99.9% pure · CAS 64-17-5 · Sigma-Aldrich · 2.5 L bottles',
    mfg: 'Sigma-Aldrich',
    lastMovement: '5 days ago',
    price: 'PKR 18,200 / 2.5L',
    description: 'Lab-grade ethanol used in chemistry, biotech and metallurgy labs.',
    locations: [
      { id: 'chem-lab-store', code: 'L-CH-S', name: 'Chemistry Dept · Solvent Store', kind: 'standalone', qty: 64 },
      { id: 'biotech-store', code: 'L-BT-S', name: 'Biotech Dept · Cold Store', kind: 'standalone', qty: 32 },
      { id: 'met-lab', code: 'L-ME-LAB', name: 'Metallurgy Lab · Cabinet 3', kind: 'standalone', qty: 16 },
      { id: 'cen-chem', code: 'L-CEN-CH', name: 'Central Store · Chemicals', kind: 'standalone', qty: 12 },
    ],
    batches: [
      { batch: 'B-2025-1142', mfgDate: '15 Aug 2025', expiry: '15 Aug 2027', qty: 32, location: 'Chemistry · Solvent Store', status: 'ok' },
      { batch: 'B-2025-1147', mfgDate: '22 Sep 2025', expiry: '22 Sep 2027', qty: 24, location: 'Chemistry · Solvent Store', status: 'ok' },
      { batch: 'B-2024-0998', mfgDate: '10 May 2024', expiry: '10 May 2026', qty: 8, location: 'Chemistry · Solvent Store', status: 'expiring' },
      { batch: 'B-2025-1241', mfgDate: '02 Nov 2025', expiry: '02 Nov 2027', qty: 32, location: 'Biotech · Cold Store', status: 'ok' },
      { batch: 'B-2024-1102', mfgDate: '18 Jul 2024', expiry: '18 Jul 2026', qty: 16, location: 'Metallurgy Lab', status: 'warn' },
      { batch: 'B-2025-1305', mfgDate: '14 Dec 2025', expiry: '14 Dec 2027', qty: 12, location: 'Central Store · Chemicals', status: 'ok' },
    ],
    activity: [
      { kind: 'out', text: 'Issued <strong>4 L</strong> to Chemistry Lab 3', meta: '5 days ago' },
      { kind: 'in', text: 'Batch <strong>B-2025-1305</strong> received', meta: '21 Apr 2026' },
      { kind: 'move', text: 'Batch <strong>B-2024-0998</strong> flagged near expiry', meta: '15 Apr 2026' },
    ]
  },

  // ----- Filler list items so the list looks populated -----
  { id: 'ITM-0143', code: 'IT-LAP-DEL-7480', name: 'Dell Latitude 7480 — Faculty Laptop', category: 'IT Equipment / Laptops', tracking: 'individual', unit: 'unit', totalQty: 86, locationCount: 9, lastMovement: '6h ago' },
  { id: 'ITM-0144', code: 'IT-LAP-LEN-T14', name: 'Lenovo ThinkPad T14 Gen 4', category: 'IT Equipment / Laptops', tracking: 'individual', unit: 'unit', totalQty: 124, locationCount: 11, lastMovement: '1 day ago' },
  { id: 'ITM-0145', code: 'IT-MON-DEL-24', name: 'Dell P2422H — 24" Monitor', category: 'IT Equipment / Displays', tracking: 'individual', unit: 'unit', totalQty: 215, locationCount: 14, lastMovement: '3h ago' },
  { id: 'ITM-0188', code: 'IT-PRJ-EPS', name: 'Epson EB-X06 — Classroom Projector', category: 'IT Equipment / Projectors', tracking: 'individual', unit: 'unit', totalQty: 42, locationCount: 22, lastMovement: '4 days ago' },
  { id: 'ITM-0212', code: 'FUR-CHR-TASK', name: 'Ergonomic Task Chair — Mesh Back', category: 'Furniture / Chairs', tracking: 'individual', unit: 'unit', totalQty: 318, locationCount: 28, lastMovement: '12 days ago' },
  { id: 'ITM-0213', code: 'FUR-DSK-FAC', name: 'Faculty Desk — 1500×750mm Laminate', category: 'Furniture / Desks', tracking: 'individual', unit: 'unit', totalQty: 184, locationCount: 24, lastMovement: '1 week ago' },
  { id: 'ITM-0270', code: 'STA-PEN-BLK', name: 'Ballpoint Pen — Blue (Box of 50)', category: 'Stationery / Writing', tracking: 'quantity', unit: 'boxes', totalQty: 84, locationCount: 18, lastMovement: '2 days ago' },
  { id: 'ITM-0272', code: 'STA-FLD-MAN', name: 'Manila File Folders — A4 (Pack of 100)', category: 'Stationery / Filing', tracking: 'quantity', unit: 'packs', totalQty: 156, locationCount: 16, lastMovement: '4 days ago', isLow: true },
  { id: 'ITM-0273', code: 'STA-STA-RM', name: 'Stapler Pins — 24/6 (Box of 5000)', category: 'Stationery / Supplies', tracking: 'quantity', unit: 'boxes', totalQty: 240, locationCount: 22, lastMovement: '1 day ago' },
  { id: 'ITM-0341', code: 'CLN-DET-LIQ', name: 'Floor Cleaner — 5L Concentrate', category: 'Cleaning / Detergents', tracking: 'quantity', unit: 'cans', totalQty: 64, locationCount: 8, lastMovement: '3 days ago' },
  { id: 'ITM-0342', code: 'CLN-MOP-IND', name: 'Industrial Mop with Bucket', category: 'Cleaning / Equipment', tracking: 'quantity', unit: 'units', totalQty: 38, locationCount: 12, lastMovement: '1 week ago' },
  { id: 'ITM-0509', code: 'CHM-HCL-37', name: 'Hydrochloric Acid — 37% (2.5L)', category: 'Chemicals / Acids', tracking: 'perishable', unit: 'bottles', totalQty: 28, locationCount: 3, lastMovement: '8 days ago' },
  { id: 'ITM-0510', code: 'CHM-NAOH-PEL', name: 'Sodium Hydroxide Pellets — 1kg', category: 'Chemicals / Bases', tracking: 'perishable', unit: 'kg', totalQty: 18, locationCount: 4, lastMovement: '11 days ago', isLow: true },
  { id: 'ITM-0612', code: 'LAB-BEK-250', name: 'Borosilicate Beaker — 250ml', category: 'Lab Glassware / Beakers', tracking: 'quantity', unit: 'pcs', totalQty: 412, locationCount: 18, lastMovement: '2 days ago' },
  { id: 'ITM-0613', code: 'LAB-FLK-500', name: 'Erlenmeyer Flask — 500ml', category: 'Lab Glassware / Flasks', tracking: 'quantity', unit: 'pcs', totalQty: 285, locationCount: 14, lastMovement: '4 days ago' },
  { id: 'ITM-0701', code: 'TLS-DRL-COR', name: 'Bosch GBM 6 RE — Corded Drill', category: 'Tools / Power Tools', tracking: 'individual', unit: 'unit', totalQty: 12, locationCount: 4, lastMovement: '6 days ago' },
  { id: 'ITM-0702', code: 'TLS-MUL-DGT', name: 'Fluke 117 — Digital Multimeter', category: 'Tools / Test & Measure', tracking: 'individual', unit: 'unit', totalQty: 24, locationCount: 6, lastMovement: '2 days ago' },
  { id: 'ITM-0850', code: 'SAF-EXT-CO2', name: 'Fire Extinguisher — CO2 5kg', category: 'Safety / Fire', tracking: 'individual', unit: 'unit', totalQty: 142, locationCount: 38, lastMovement: '1 month ago' },
  { id: 'ITM-0851', code: 'SAF-HEL-Y', name: 'Safety Helmet — Yellow', category: 'Safety / PPE', tracking: 'quantity', unit: 'pcs', totalQty: 220, locationCount: 12, lastMovement: '2 weeks ago' },
];
