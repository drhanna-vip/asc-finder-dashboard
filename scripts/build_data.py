#!/usr/bin/env python3
"""Build VIP locations + ASC data files"""
import json, time, urllib.request, urllib.parse, re, os

DATA_DIR = '/root/clawd/dashboards/asc-finder/data'
os.makedirs(DATA_DIR, exist_ok=True)

VIP_LOCATIONS_RAW = [
    # NY
    {"id":"vip-001","name":"Midtown Manhattan","city":"New York","state":"NY","address":"290 Madison Avenue Floor 2, New York, NY 10017"},
    {"id":"vip-002","name":"Upper East Side","city":"New York","state":"NY","address":"1111 Park Avenue Suite 1B, New York, NY 10128"},
    {"id":"vip-003","name":"Financial District","city":"New York","state":"NY","address":"156 William Street Suite 302, New York, NY 10038"},
    {"id":"vip-004","name":"Astoria","city":"Astoria","state":"NY","address":"23-25 31st St Suite 410, Astoria, NY 11105"},
    {"id":"vip-005","name":"Forest Hills","city":"Forest Hills","state":"NY","address":"107-30 71st Rd Suite 204, Forest Hills, NY 11375"},
    {"id":"vip-006","name":"Downtown Brooklyn","city":"Brooklyn","state":"NY","address":"188 Montague Street 10th Floor, Brooklyn, NY 11201"},
    {"id":"vip-007","name":"Brighton Beach","city":"Brooklyn","state":"NY","address":"23 Brighton 11th St 7th Floor, Brooklyn, NY 11235"},
    {"id":"vip-008","name":"Bronx","city":"Bronx","state":"NY","address":"2100 Bartow Ave Suite 400, Bronx, NY 10475"},
    {"id":"vip-009","name":"Staten Island","city":"Staten Island","state":"NY","address":"4236 Hylan Blvd, Staten Island, NY 10312"},
    {"id":"vip-010","name":"Yonkers","city":"Yonkers","state":"NY","address":"124 New Main St, Yonkers, NY 10701"},
    {"id":"vip-011","name":"Hartsdale","city":"Hartsdale","state":"NY","address":"280 N Central Ave Suite 450, Hartsdale, NY 10530"},
    {"id":"vip-012","name":"Jericho","city":"Jericho","state":"NY","address":"350 Jericho Tpke Suite 310, Jericho, NY 11753"},
    {"id":"vip-013","name":"West Islip","city":"West Islip","state":"NY","address":"500 Montauk Hwy Suite G, West Islip, NY 11795"},
    {"id":"vip-014","name":"Port Jefferson","city":"Port Jefferson","state":"NY","address":"70 N Country Rd Suite 201, Port Jefferson, NY 11777"},
    # NJ
    {"id":"vip-015","name":"Hoboken","city":"Hoboken","state":"NJ","address":"70 Hudson St Lower Level, Hoboken, NJ 07030"},
    {"id":"vip-016","name":"Edgewater","city":"Edgewater","state":"NJ","address":"968 River Rd Suite 200, Edgewater, NJ 07020"},
    {"id":"vip-017","name":"Harrison","city":"Harrison","state":"NJ","address":"620 Essex St Suite 202, Harrison, NJ 07029"},
    {"id":"vip-018","name":"Clifton","city":"Clifton","state":"NJ","address":"1117 Route 46 East Suite 205, Clifton, NJ 07013"},
    {"id":"vip-019","name":"Woodland Park","city":"Woodland Park","state":"NJ","address":"1167 McBride Ave Suite 2, Woodland Park, NJ 07424"},
    {"id":"vip-020","name":"Paramus","city":"Paramus","state":"NJ","address":"140 NJ-17 Suite 269, Paramus, NJ 07652"},
    {"id":"vip-021","name":"Morris County (Parsippany)","city":"Parsippany","state":"NJ","address":"3695 Hill Rd Suite 2A, Parsippany, NJ 07054"},
    {"id":"vip-022","name":"Morristown","city":"Morristown","state":"NJ","address":"310 Madison Ave 3rd Floor, Morristown, NJ 07960"},
    {"id":"vip-023","name":"West Orange","city":"West Orange","state":"NJ","address":"405 Northfield Ave Suite 204, West Orange, NJ 07052"},
    {"id":"vip-024","name":"Scotch Plains","city":"Scotch Plains","state":"NJ","address":"2253 South Ave Suite 2, Scotch Plains, NJ 07076"},
    {"id":"vip-025","name":"Woodbridge (Iselin)","city":"Iselin","state":"NJ","address":"517 US Route 1 Suite 1100, Iselin, NJ 08830"},
    {"id":"vip-026","name":"Princeton","city":"Princeton","state":"NJ","address":"8 Forrestal Rd S Suite 203, Princeton, NJ 08540"},
    {"id":"vip-027","name":"Marlton","city":"Marlton","state":"NJ","address":"525 Route 73 N Suite 117, Marlton, NJ 08053"},
    # CT
    {"id":"vip-028","name":"Stamford","city":"Stamford","state":"CT","address":"1266 E Main St Suite 465, Stamford, CT 06902"},
    {"id":"vip-029","name":"Hamden","city":"Hamden","state":"CT","address":"2080 Whitney Ave Suite 250, Hamden, CT 06518"},
    {"id":"vip-030","name":"Farmington","city":"Farmington","state":"CT","address":"399 Farmington Ave LL2, Farmington, CT 06032"},
    # MD
    {"id":"vip-031","name":"Bethesda","city":"Bethesda","state":"MD","address":"6903 Rockledge Dr Suite 470, Bethesda, MD 20817"},
    {"id":"vip-032","name":"Bowie","city":"Bowie","state":"MD","address":"4201 Northview Dr Suite 104, Bowie, MD 20716"},
    {"id":"vip-033","name":"Maple Lawn (Fulton)","city":"Fulton","state":"MD","address":"11810 W Market Pl Suite 300, Fulton, MD 20759"},
    # TX
    {"id":"vip-034","name":"Addison (Dallas)","city":"Dallas","state":"TX","address":"17980 Dallas Pkwy Suite 300, Dallas, TX 75287"},
    {"id":"vip-035","name":"Arlington","city":"Arlington","state":"TX","address":"3050 S Center St Suite 110, Arlington, TX 76014"},
    {"id":"vip-036","name":"Fort Worth","city":"Fort Worth","state":"TX","address":"3455 Locke Ave Suite 300, Fort Worth, TX 76107"},
    {"id":"vip-037","name":"Cedar Park","city":"Cedar Park","state":"TX","address":"351 Cypress Creek Rd Suite 100, Cedar Park, TX 78612"},
    {"id":"vip-038","name":"Kyle","city":"Kyle","state":"TX","address":"135 Bunton Creek Rd Suite 102, Kyle, TX 78640"},
    # CA
    {"id":"vip-039","name":"Encino","city":"Encino","state":"CA","address":"16260 Ventura Blvd Suite 140, Encino, CA 91436"},
    {"id":"vip-040","name":"Huntington Beach","city":"Huntington Beach","state":"CA","address":"7677 Center Ave Suite 310, Huntington Beach, CA 92647"},
    {"id":"vip-041","name":"Irvine","city":"Irvine","state":"CA","address":"4482 Barranca Pkwy Suite 252, Irvine, CA 92604"},
    {"id":"vip-042","name":"Newport Beach","city":"Newport Beach","state":"CA","address":"1525 Superior Ave Suite 202, Newport Beach, CA 92663"},
    {"id":"vip-043","name":"National City","city":"National City","state":"CA","address":"22 W 35th St Suite 202, National City, CA 91950"},
    {"id":"vip-044","name":"Poway","city":"Poway","state":"CA","address":"15708 Pomerado Rd Suite N202, Poway, CA 92064"},
    {"id":"vip-045","name":"San Diego (Sorrento Valley)","city":"San Diego","state":"CA","address":"5330 Carroll Canyon Rd Suite 140, San Diego, CA 92121"},
    {"id":"vip-046","name":"Temecula","city":"Temecula","state":"CA","address":"27290 Madison Ave Suite 102, Temecula, CA 92590"},
    {"id":"vip-047","name":"Palo Alto","city":"Palo Alto","state":"CA","address":"2248 Park Blvd, Palo Alto, CA 94306"},
    {"id":"vip-048","name":"San Jose","city":"San Jose","state":"CA","address":"1270 S Winchester Blvd Suite 102, San Jose, CA 95128"},
]

def geocode(address, delay=1.1):
    q = urllib.parse.quote(address)
    url = f"https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=1"
    req = urllib.request.Request(url, headers={"User-Agent": "VIP-ASC-Finder/1.0 (georgehannamd@gmail.com)"})
    try:
        r = urllib.request.urlopen(req, timeout=8)
        data = json.loads(r.read())
        if data:
            return float(data[0]['lat']), float(data[0]['lon'])
    except Exception as e:
        print(f"  Geocode error: {e}")
    time.sleep(delay)
    return None, None

print("=== Geocoding VIP Locations ===")
vip_locations = []
for loc in VIP_LOCATIONS_RAW:
    print(f"Geocoding {loc['name']}...", end=' ', flush=True)
    lat, lng = geocode(loc['address'])
    if lat is None:
        # fallback: city+state
        lat, lng = geocode(f"{loc['city']}, {loc['state']}")
    loc['lat'] = lat
    loc['lng'] = lng
    loc['phone'] = ""
    vip_locations.append(loc)
    print(f"{lat}, {lng}")
    time.sleep(1.1)

with open(f'{DATA_DIR}/vip-locations.json', 'w') as f:
    json.dump(vip_locations, f, indent=2)
print(f"Saved {len(vip_locations)} VIP locations")

# ========== PROCESS NPI DATA ==========
INN_LIKELY_KEYWORDS = [
    'SCA ', 'SURGERY CENTER OF AMERICA', 'AMSURG', 'USPI', 'UNITED SURGICAL',
    'TENET', 'HCA ', 'ASCENSION', 'COMMONSPIRIT', 'ENVISION',
    'SURGCENTER', 'SURG CENTER', 'AMBULATORY SURGICAL CENTER',
    'SURGICAL CARE AFFILIATES', 'COMMUNITY HEALTH', 'STEWARD',
    'ATLANTIC HEALTH', 'HACKENSACK', 'NORTHWELL', 'NYU ', 'MOUNT SINAI',
    'COLUMBIA', 'PRESBYTERIAN', 'METHODIST', 'BAPTIST', 'ADVENTIST',
    'PROVIDENCE', 'DIGNITY HEALTH', 'SUTTER ', 'KAISER',
    'BAYLOR ', 'TEXAS HEALTH', 'MEMORIAL HERMAN', 'CHRISTUS',
]
EXCLUDE_KEYWORDS = [
    'HOSPITAL', 'MEDICAL CENTER', 'HEALTH SYSTEM', 'UNIVERSITY HOSPITAL',
    'GENERAL HOSPITAL', 'REGIONAL HOSPITAL', 'COMMUNITY HOSPITAL'
]

def classify_inn(name_upper):
    for kw in EXCLUDE_KEYWORDS:
        if kw in name_upper:
            return None  # exclude
    for kw in INN_LIKELY_KEYWORDS:
        if kw in name_upper:
            return 'INN-likely'
    return 'INN-verify'

def extract_phone(r):
    for addr in r.get('addresses', []):
        phone = addr.get('telephone_number', '')
        if phone:
            return phone
    return ''

def process_npi_file(path, state):
    try:
        with open(path) as f:
            data = json.load(f)
    except:
        return []
    results = []
    seen = set()
    for r in data.get('results', []):
        npi = r.get('number', '')
        if npi in seen:
            continue
        bi = r.get('basic', {})
        org_name = bi.get('organization_name', '') or bi.get('authorized_official_last_name', '')
        if not org_name:
            continue
        name_upper = org_name.upper()
        inn = classify_inn(name_upper)
        if inn is None:
            continue  # filter out hospitals
        # Get practice address
        addr_obj = {}
        for a in r.get('addresses', []):
            if a.get('address_purpose') == 'LOCATION':
                addr_obj = a
                break
        if not addr_obj and r.get('addresses'):
            addr_obj = r['addresses'][0]
        address = addr_obj.get('address_1', '')
        city = addr_obj.get('city', '')
        astate = addr_obj.get('state', state)
        zip_code = addr_obj.get('postal_code', '')[:5]
        phone = addr_obj.get('telephone_number', '') or extract_phone(r)
        # Determine INN platform hint
        inn_platform = ''
        name_up = org_name.upper()
        for kw in ['SCA ', 'AMSURG', 'USPI', 'TENET', 'HCA', 'ASCENSION', 'NORTHWELL', 'NYU', 'MOUNT SINAI']:
            if kw in name_up:
                inn_platform = kw.strip()
                break
        seen.add(npi)
        results.append({
            "id": f"asc-{npi}",
            "npi": npi,
            "name": org_name,
            "address": address,
            "city": city,
            "state": astate,
            "zip": zip_code,
            "phone": phone,
            "lat": None,
            "lng": None,
            "innStatus": inn,
            "innPlatform": inn_platform,
            "notes": "",
            "checklist": {},
            "addedDate": "2026-05-13"
        })
    return results

print("\n=== Processing NPI Data ===")
npi_files = {
    'NY': '/tmp/npi_ny.json',
    'NJ': '/tmp/npi_nj.json',
    'CT': '/tmp/npi_ct.json',
    'MD': '/tmp/npi_md.json',
    'TX': '/tmp/npi_tx.json',
    'CA': '/tmp/npi_ca.json',
}

all_ascs = []
for state, path in npi_files.items():
    ascs = process_npi_file(path, state)
    print(f"  {state}: {len(ascs)} ASCs (after filtering)")
    all_ascs.extend(ascs)

print(f"\nTotal ASCs before geocoding: {len(all_ascs)}")
print(f"INN-likely: {sum(1 for a in all_ascs if a['innStatus']=='INN-likely')}")
print(f"INN-verify: {sum(1 for a in all_ascs if a['innStatus']=='INN-verify')}")

# ========== GEOCODE ASCs ==========
print("\n=== Geocoding ASCs (this takes a while) ===")
geocoded = 0
failed = 0
for i, asc in enumerate(all_ascs):
    full_addr = f"{asc['address']}, {asc['city']}, {asc['state']} {asc['zip']}"
    lat, lng = geocode(full_addr, delay=1.1)
    if lat is None:
        # fallback: zip only
        if asc['zip']:
            lat, lng = geocode(f"{asc['zip']}, {asc['state']}", delay=1.1)
    asc['lat'] = lat
    asc['lng'] = lng
    if lat:
        geocoded += 1
    else:
        failed += 1
    if (i+1) % 20 == 0:
        print(f"  Progress: {i+1}/{len(all_ascs)} geocoded={geocoded} failed={failed}")

print(f"Geocoding complete: {geocoded} success, {failed} failed")

with open(f'{DATA_DIR}/ascs.json', 'w') as f:
    json.dump(all_ascs, f, indent=2)

# Init user-notes.json
notes_path = f'{DATA_DIR}/user-notes.json'
if not os.path.exists(notes_path):
    with open(notes_path, 'w') as f:
        json.dump({}, f)

print(f"\nSaved {len(all_ascs)} ASCs to {DATA_DIR}/ascs.json")
print("Done!")
