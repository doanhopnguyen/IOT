from html.parser import HTMLParser
from urllib.parse import urljoin
import requests

class Scripts(HTMLParser):
    def __init__(self): super().__init__(); self.sources = []
    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            for key, value in attrs:
                if key == 'src': self.sources.append(value)

base = 'http://127.0.0.1:8081'
page = requests.get(base, timeout=30); page.raise_for_status()
parser = Scripts(); parser.feed(page.text)
assert parser.sources, 'No application bundle in Expo web response'
for source in parser.sources:
    response = requests.get(urljoin(base, source), timeout=180)
    print('Web bundle status:', response.status_code, 'bytes:', len(response.content))
    if response.status_code != 200:
        print(response.text[:1800]); response.raise_for_status()
print('Expo web bundle compiled and served successfully.')
