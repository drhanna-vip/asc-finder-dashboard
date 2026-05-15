'use strict';
const fs = require('fs');
const path = require('path');

const ASCS_FILE = path.join(__dirname, '..', 'data', 'ascs.json');

// ==================== MATCHING RULES ====================
// Each entry: { operatorName, patterns: string[] }
// For SCA, special word-boundary handling via regex
const NATIONAL_OPERATORS = [
  {
    operatorName: 'USPI',
    patterns: ['UNITED SURGICAL PARTNERS', 'USPI', 'USP LLC', 'USP LTD',
               'BAYLOR SCOTT WHITE SURGERY', 'NORTH TEXAS SURGERY', 'WESTERN HILLS SURGERY']
  },
  {
    operatorName: 'SCA Health',
    patterns: ['SURGICAL CARE AFFILIATES', 'SCA HEALTH', 'SCAHEALTH'],
    wordBoundaryPatterns: [' SCA '] // must be surrounded by spaces
  },
  {
    operatorName: 'Surgery Partners',
    patterns: ['SURGERY PARTNERS', 'NATIONAL SURGICAL HEALTHCARE', 'NSH SURGERY', 'SURGPARTNERS'],
    wordBoundaryPatterns: [' NSH ']
  },
  {
    operatorName: 'AmSurg',
    patterns: ['AMSURG', 'AM SURG', 'ENVISION SURGERY', 'ENVISION SURGICAL']
  },
  {
    operatorName: 'HCA',
    patterns: ['HCA SURGERY', 'HCA HEALTHCARE', 'SARAH CANNON SURGERY',
               'HCA FLORIDA', 'HCA HOUSTON', 'HCA MIDWEST', 'HCA MOUNTAIN',
               'HCA VIRGINIA', 'HCA EAST'],
    wordBoundaryPatterns: [' HCA ']
  },
  {
    operatorName: 'Covenant Surgical',
    patterns: ['COVENANT SURGICAL', 'COVENANT SURGERY']
  },
  {
    operatorName: 'Regent Surgical',
    patterns: ['REGENT SURGICAL', 'REGENT SURGERY']
  },
  {
    operatorName: 'American Vision Partners',
    patterns: ['AMERICAN VISION PARTNERS', 'AVP SURGERY', 'VISION PARTNERS SURGERY']
  },
  {
    operatorName: 'Nueterra',
    patterns: ['NUETERRA']
  },
  {
    operatorName: 'Physicians Endoscopy',
    patterns: ['PHYSICIANS ENDOSCOPY']
  },
  {
    operatorName: 'Blue Chip Surgical',
    patterns: ['BLUE CHIP SURGICAL']
  },
  {
    operatorName: 'National Surgical Care',
    patterns: ['NATIONAL SURGICAL CENTERS', 'NSC SURGERY']
  }
];

const HEALTH_SYSTEM_PATTERNS = [
  'MAYO CLINIC', 'CLEVELAND CLINIC', 'JOHNS HOPKINS', 'KAISER PERMANENTE', 'KAISER SURGERY',
  'INTERMOUNTAIN', 'GEISINGER', 'ADVOCATE SURGERY', 'NORTHWELL', 'MOUNT SINAI SURGERY',
  'NYU LANGONE', 'CEDARS-SINAI', 'STANFORD HEALTH', 'UCSD SURGERY', 'UCLA SURGERY',
  'PRESBYTERIAN SURGERY', 'METHODIST SURGERY', 'BAPTIST SURGERY', 'ADVENTIST SURGERY',
  'DIGNITY HEALTH SURGERY', 'PROVIDENCE SURGERY', 'ASCENSION SURGERY', 'COMMONSPIRIT'
];

// ==================== MATCHING LOGIC ====================
function matchesAny(text, patterns) {
  if (!text) return false;
  const upper = text.toUpperCase();
  return patterns.some(p => upper.includes(p.toUpperCase()));
}

function matchesWordBoundary(text, patterns) {
  if (!text || !patterns || !patterns.length) return false;
  const upper = ' ' + text.toUpperCase() + ' '; // pad for word-boundary matching
  return patterns.some(p => upper.includes(p.toUpperCase()));
}

function classifyRecord(name, dba) {
  const nameUp = (name || '').toUpperCase();
  const dbaUp = (dba || '').toUpperCase();
  const combined = nameUp + ' ' + dbaUp;

  // Check national operators (priority 1)
  for (const op of NATIONAL_OPERATORS) {
    if (matchesAny(combined, op.patterns)) {
      return { operatorType: 'national', operatorName: op.operatorName };
    }
    if (op.wordBoundaryPatterns && matchesWordBoundary(combined, op.wordBoundaryPatterns)) {
      return { operatorType: 'national', operatorName: op.operatorName };
    }
  }

  // Check health systems (priority 2)
  if (matchesAny(combined, HEALTH_SYSTEM_PATTERNS)) {
    return { operatorType: 'health-system', operatorName: 'Health System' };
  }

  // Unknown if no name
  if (!name && !dba) {
    return { operatorType: 'unknown', operatorName: '' };
  }

  // Default: independent
  return { operatorType: 'independent', operatorName: '' };
}

// ==================== MAIN ====================
function main() {
  console.log('Reading ascs.json...');
  const ascs = JSON.parse(fs.readFileSync(ASCS_FILE, 'utf8'));
  console.log(`Total records: ${ascs.length}`);

  const counts = { national: 0, 'health-system': 0, independent: 0, unknown: 0 };
  const nationalBreakdown = {};

  const enriched = ascs.map(asc => {
    const { operatorType, operatorName } = classifyRecord(asc.name, asc.dba);
    counts[operatorType] = (counts[operatorType] || 0) + 1;
    if (operatorType === 'national') {
      nationalBreakdown[operatorName] = (nationalBreakdown[operatorName] || 0) + 1;
    }
    return { ...asc, operatorType, operatorName };
  });

  fs.writeFileSync(ASCS_FILE, JSON.stringify(enriched, null, 2));
  console.log('\n✅ Enrichment complete. Summary:');
  console.log(`  National:     ${counts.national}`);
  console.log(`  Health-System:${counts['health-system']}`);
  console.log(`  Independent:  ${counts.independent}`);
  console.log(`  Unknown:      ${counts.unknown}`);

  console.log('\nNational operator breakdown:');
  const sorted = Object.entries(nationalBreakdown).sort((a, b) => b[1] - a[1]);
  sorted.forEach(([name, count]) => console.log(`  ${name}: ${count}`));
}

main();
