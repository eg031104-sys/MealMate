#!/usr/bin/env python3
"""One explicit live diagnostic, not a substitute for Android/browser testing.
Uses the inherited HTTP(S) proxy and normal TLS verification. No credentials.
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ORIGIN = 'https://mealmate-household-kitchen.racingbream9.chatgpt.site'
HEADERS = {'User-Agent': 'MealMate/3 (+https://github.com/eg031104-sys/MealMate)', 'Origin': ORIGIN}


def read(url, body=None):
    request = urllib.request.Request(url, data=body, headers=HEADERS)
    if body is not None:
        request.add_header('Content-Type', 'application/x-www-form-urlencoded')
    with urllib.request.urlopen(request, timeout=12) as response:
        allow = response.headers.get('Access-Control-Allow-Origin', '(missing)')
        print('HTTP', response.status, 'source:', urllib.parse.urlparse(url).netloc, 'Access-Control-Allow-Origin:', allow)
        if allow not in ('*', ORIGIN):
            print('WARNING: this response does not permit the MealMate browser origin.')
        return json.load(response)


def chain(name):
    for candidate in ('Coles', 'Woolworths', 'ALDI', 'IGA'):
        if re.search(r'\b' + candidate + r'\b', name, re.I) and not re.search(r'Express|Petrol|Caltex', name, re.I):
            return candidate


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--postcode', default='4272')
    args = parser.parse_args()
    if not re.fullmatch(r'\d{4}', args.postcode):
        parser.error('Use a four-digit Australian postcode.')
    params = urllib.parse.urlencode({'q': args.postcode, 'countrycode': 'AU', 'limit': 10, 'lang': 'en'})
    try:
        raw = read('https://photon.komoot.io/api/?' + params)
        places = [f for f in raw['features'] if str(f['properties'].get('countrycode', '')).upper() == 'AU' and f['properties'].get('osm_key') in ('place', 'boundary') and args.postcode in (f['properties'].get('postcode'), f['properties'].get('name'))]
        if not places:
            raise ValueError('No Australian locality/postcode match returned.')
        place = places[0]
        lon, lat = place['geometry']['coordinates'][:2]
        print('Source-provided search centre:', json.dumps(place['properties'], ensure_ascii=False), lat, lon)
    except Exception as error:
        print('LIVE CHECK FAILED before store lookup:', str(error))
        print('A proxy CONNECT denial is a development-network restriction, not an upstream HTTP/CORS diagnosis.')
        return 1
    params = urllib.parse.urlencode([('lat', lat), ('lon', lon), ('radius', 30), ('limit', 100), ('osm_tag', 'shop:supermarket'), ('osm_tag', 'shop:convenience')])
    query = f'[out:json][timeout:10];nwr(around:30000,{lat},{lon})[shop~"^(supermarket|convenience)$"][~"^(name|brand|operator)$"~"Coles|Woolworths|ALDI|IGA",i];out center tags;'
    sources = [('Photon', 'https://photon.komoot.io/reverse?' + params, None), ('VK Maps Overpass', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', urllib.parse.urlencode({'data': query}).encode()), ('Private.coffee', 'https://overpass.private.coffee/api/interpreter', urllib.parse.urlencode({'data': query}).encode())]
    for source, url, body in sources:
        time.sleep(1.2)
        try:
            raw = read(url, body)
            if raw.get('remark'):
                raise ValueError('Incomplete Overpass response: ' + raw['remark'])
            records = []
            if 'features' in raw:
                for feature in raw['features']:
                    p = feature['properties']
                    if str(p.get('countrycode', '')).upper() != 'AU' or p.get('osm_key') != 'shop':
                        continue
                    records.append({'name': p.get('name', ''), 'address': ', '.join(filter(None, [' '.join(filter(None, [p.get('housenumber'), p.get('street')])), p.get('city'), p.get('state'), p.get('postcode')]))})
            else:
                for element in raw['elements']:
                    p = element.get('tags', {})
                    records.append({'name': p.get('name', ''), 'address': p.get('addr:full') or ', '.join(filter(None, [' '.join(filter(None, [p.get('addr:housenumber'), p.get('addr:street')])), p.get('addr:suburb') or p.get('addr:city'), p.get('addr:state'), p.get('addr:postcode')]))})
            records = [{**r, 'chain': chain(r['name'])} for r in records if chain(r['name'])]
            print(source, 'REAL SOURCE RECORDS:', json.dumps(records, ensure_ascii=False, indent=2))
            covered = {r['chain'] for r in records if r['address']}
            if covered == {'Coles', 'Woolworths', 'ALDI', 'IGA'}:
                print('Live data check passed: all four chains returned named records with address fields. Browser execution, distance sorting and full address completeness still require separate verification.')
                return 0
            print('Coverage not yet verified for all four chains; checking next source once.')
        except Exception as error:
            print(source, 'FAILED:', str(error))
    print('Live four-chain search verification FAILED. Do not claim a successful 4272 search.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
