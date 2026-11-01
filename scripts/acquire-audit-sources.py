"""Explicit acquisition step. Offline scoring never invokes this script."""
import datetime
import hashlib
import json
import pathlib
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1] / 'eval/extraction-audit'
DRUGS = ['lisinopril', 'atorvastatin', 'metformin', 'amlodipine', 'losartan', 'omeprazole', 'gabapentin', 'levothyroxine', 'sertraline', 'furosemide', 'hydroxyzine', 'ibuprofen', 'acetaminophen', 'nitroglycerin', 'albuterol', 'prednisone', 'warfarin', 'methotrexate', 'cephalexin', 'amoxicillin', 'fluoxetine', 'escitalopram', 'duloxetine', 'pantoprazole', 'famotidine', 'cetirizine', 'loratadine', 'naproxen', 'ondansetron', 'clonidine']

def main():
    rows = []
    for i, drug in enumerate(DRUGS):
        url = 'https://api.fda.gov/drug/label.json?' + urllib.parse.urlencode({'search': f'openfda.generic_name:"{drug}" AND _exists_:dosage_and_administration', 'limit': 1})
        with urllib.request.urlopen(url, timeout=40) as response:
            payload = json.load(response)
        label = payload['results'][0]
        section = label['dosage_and_administration'][0]
        # A contiguous, unchanged excerpt, ending at a space. Never insert a drug name.
        end = section.rfind(' ', 0, min(len(section), 900)) if len(section) > 900 else len(section)
        excerpt = section[:end]
        filename = f'sources/{drug}.json'
        snapshot = {'id': label['id'], 'set_id': label.get('set_id'), 'effective_time': label.get('effective_time'), 'dosage_and_administration': section, 'acquisition_url': url}
        (ROOT / filename).write_text(json.dumps(snapshot, indent=2) + '\n')
        rows.append({'id': f'p{i+1:02}', 'split': 'dev' if i < 10 else 'final', 'sourceFamily': drug, 'sourceId': label.get('set_id', label['id']), 'input': excerpt, 'source': {'provider': 'openFDA', 'url': url, 'original': 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=' + label.get('set_id', ''), 'snapshot': filename, 'section': 'dosage_and_administration', 'start': 0, 'end': end, 'sha256': hashlib.sha256(section.encode()).hexdigest(), 'acquiredAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'license': 'CC0-1.0', 'licenseUrl': 'https://open.fda.gov/license/', 'rightsNote': 'openFDA default CC0 policy. Drug label text only, no GMDN device content. No endorsement implied.'}, 'review': {'status': 'draft', 'reviewer': None, 'correction': None}, 'ambiguity': 'Label excerpt may describe multiple populations, titration or alternatives. Extract stated mentions, do not infer a patient prescription.'})
        print(drug, len(excerpt), flush=True)
    (ROOT / 'public.json').write_text(json.dumps(rows, indent=2) + '\n')

if __name__ == '__main__':
    main()
