import base64,io,json,struct,threading,time,tempfile,os
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright, expect
import re

def png(text, color):
    im=Image.new('RGB',(640,960),color);ImageDraw.Draw(im).text((180,160),text,fill='black',font_size=32);b=io.BytesIO();im.save(b,format='PNG');return b.getvalue()
original=png('HELLO WORLD','white'); result=png('HALO DUNIA','#e6ffe6')
original_url='data:image/png;base64,'+base64.b64encode(original).decode()
seen=[]
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*a):pass
    def do_GET(self):
        if self.path=='/openapi.json':
            data=json.dumps({'paths':{'/translate/with-form/image/stream':{'post':{}}}}).encode();typ='application/json'
        else:
            data=('<html><body style="margin:0"><img id="page" width="640" height="960" src="'+original_url+'"></body></html>').encode();typ='text/html'
        self.send_response(200);self.send_header('Content-Type',typ);self.end_headers();self.wfile.write(data)
    def do_POST(self):
        body=self.rfile.read(int(self.headers['Content-Length']));seen.append(body)
        assert b'm2m100' in body and b'IND' in body and b'lama_large' in body
        self.send_response(200);self.send_header('Content-Type','application/octet-stream');self.end_headers()
        for code,payload in [(1,b'ocr'),(1,b'inpainting'),(0,result)]:
            frame=bytes([code])+struct.pack('>I',len(payload))+payload
            for part in [frame[:2],frame[2:4],frame[4:]]:
                self.wfile.write(part);self.wfile.flush();time.sleep(.03)
for port in [8000,8765]:
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
    extension=str(Path(__file__).resolve().parents[1])
    with tempfile.TemporaryDirectory() as profile:
        ctx=p.chromium.launch_persistent_context(profile,executable_path=os.environ.get('CHROMIUM_PATH', p.chromium.executable_path),headless=True,ignore_default_args=['--disable-extensions'],args=['--no-sandbox',f'--disable-extensions-except={extension}',f'--load-extension={extension}'])
        sw=ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker')
        extid=sw.url.split('/')[2]
        page=ctx.new_page();page.goto('http://127.0.0.1:8765');page.wait_for_timeout(500)
        tabid=sw.evaluate("async () => (await chrome.tabs.query({})).find(t=>t.url?.includes(':8765')).id")
        popup=ctx.new_page();popup.goto(f'chrome-extension://{extid}/popup.html')
        popup.locator('#checkEngine').click();expect(popup.locator('#status')).to_contain_text('Server lokal terhubung')
        print('PASS engine health and offscreen creation')
        assert popup.locator('#apiKey').count()==0
        sw.evaluate('(id) => chrome.tabs.sendMessage(id,{type:"TRANSLATE_VISIBLE"})',tabid)
        page.wait_for_function('(original) => document.querySelector("#page").src !== original',arg=original_url)
        assert len(seen)==1
        translated=page.locator('#page').get_attribute('src');assert translated.startswith('data:image/png;base64,')
        print('PASS content -> service worker -> offscreen -> multipart stream -> rendered image')
        sw.evaluate('(id) => chrome.tabs.sendMessage(id,{type:"TOGGLE_ORIGINALS"})',tabid)
        page.wait_for_function('(original) => document.querySelector("#page").src === original',arg=original_url)
        sw.evaluate('(id) => chrome.tabs.sendMessage(id,{type:"TOGGLE_ORIGINALS"})',tabid)
        page.wait_for_function('(translated) => document.querySelector("#page").src === translated',arg=translated)
        print('PASS original/result toggle preserves both versions')
        page.bring_to_front();page.locator('#page').hover(position={"x":320,"y":480});page.wait_for_timeout(300)
        # CDP pierces the closed shadow root. Re-query after every interaction because
        # Chromium invalidates DOM node IDs when the toolbar text/layout is updated.
        cdp=ctx.new_cdp_session(page)
        def find_buttons(node):
            found=[]
            if node.get('nodeName')=='BUTTON': found.append(node)
            for key in ['children','shadowRoots']:
                for child in node.get(key,[]):found+=find_buttons(child)
            return found
        def button_center(label):
            for _ in range(5):
                root=cdp.send('DOM.getDocument',{'depth':-1,'pierce':True})['root']
                button=next((b for b in find_buttons(root) if any(c.get('nodeValue')==label for c in b.get('children',[]))),None)
                if button:
                    try:
                        model=cdp.send('DOM.getBoxModel',{'nodeId':button['nodeId']})['model']['content']
                        return (model[0]+model[4])/2,(model[1]+model[5])/2
                    except Exception:
                        page.wait_for_timeout(80)
            raise AssertionError(f'Could not locate visible toolbar button: {label}')
        x,y=button_center('Original')
        page.mouse.click(x,y);page.wait_for_timeout(200);assert page.locator('#page').get_attribute('src')==original_url
        x,y=button_center('Result')
        page.mouse.click(x,y);page.wait_for_timeout(200);assert page.locator('#page').get_attribute('src')==translated
        print('PASS toolbar short click toggles original/result')
        page.locator('#page').hover(position={"x":320,"y":480});page.wait_for_timeout(220)
        x,y=button_center('Original')
        page.mouse.move(x,y);page.mouse.down();page.wait_for_timeout(400);assert page.locator('#page').get_attribute('src')==original_url
        page.mouse.up();page.wait_for_timeout(200);assert page.locator('#page').get_attribute('src')==translated
        print('PASS toolbar press-and-hold temporarily reveals original')

        # The manga image itself also supports the hold-to-peek gesture.
        page.locator('#page').hover(position={"x":320,"y":480});page.mouse.down()
        page.wait_for_timeout(360)
        assert page.locator('#page').get_attribute('src')==original_url
        page.mouse.up();page.wait_for_timeout(120)
        assert page.locator('#page').get_attribute('src')==translated
        print('PASS press-and-hold directly on the manga image reveals original')

        # Selected-area translation must be composited into the page image, not left
        # as a temporary viewport overlay that disappears during scrolling.
        sw.evaluate('(id) => chrome.tabs.sendMessage(id,{type:"TOGGLE_ORIGINALS"})',tabid)
        page.wait_for_function('(original) => document.querySelector("#page").src === original',arg=original_url)
        sw.evaluate('(id) => chrome.tabs.sendMessage(id,{type:"START_AREA_SELECTION"})',tabid)
        page.mouse.move(100,100);page.mouse.down();page.mouse.move(300,300,steps=5);page.mouse.up()
        page.wait_for_function('(original) => document.querySelector("#page").src !== original',arg=original_url,timeout=15000)
        area_translated=page.locator('#page').get_attribute('src')
        assert area_translated.startswith('data:image/png;base64,')
        assert page.locator('#page').evaluate('(img) => [img.naturalWidth,img.naturalHeight]') == [640,960]
        assert len(seen)==2
        sw.evaluate('(id) => chrome.tabs.sendMessage(id,{type:"TOGGLE_ORIGINALS"})',tabid)
        page.wait_for_function('(original) => document.querySelector("#page").src === original',arg=original_url)
        sw.evaluate('(id) => chrome.tabs.sendMessage(id,{type:"TOGGLE_ORIGINALS"})',tabid)
        page.wait_for_function('(translated) => document.querySelector("#page").src === translated',arg=area_translated)
        print('PASS selected-area result is merged into the full page and Original/Result still works')

        # Smoke-check the expanded editor controls in its isolated shadow root.
        page.locator('#page').hover(position={"x":320,"y":480});page.wait_for_timeout(250)
        x,y=button_center('Edit');page.mouse.click(x,y);page.wait_for_timeout(250)
        root=cdp.send('DOM.getDocument',{'depth':-1,'pierce':True})['root']
        editor_buttons=find_buttons(root)
        labels=[c.get('nodeValue') for b in editor_buttons for c in b.get('children',[]) if c.get('nodeValue')]
        assert 'Undo' in labels and 'Redo' in labels and 'Penghapus' in labels, labels
        print('PASS image editor exposes undo, redo, and transparent eraser controls')
        page.keyboard.press('Escape');page.wait_for_timeout(100)
        print('PASS popup has no API-key controls')

        wide=Image.new('RGB',(1000,180),'white');ImageDraw.Draw(wide).text((30,50),'WEBTOON PANEL',fill='black')
        wide_buffer=io.BytesIO();wide.save(wide_buffer,format='PNG')
        wide_url='data:image/png;base64,'+base64.b64encode(wide_buffer.getvalue()).decode()
        page.evaluate('(src) => { document.body.innerHTML = ""; const img=document.createElement("img");img.id="wide";img.src=src;img.width=1000;img.height=180;document.body.append(img); }',wide_url)
        page.locator('#wide').hover(position={"x":500,"y":90});page.wait_for_timeout(220)
        button_center('R')
        print('PASS wide webtoon panels are detected for manual translation')

        page.evaluate('(src) => { document.body.innerHTML = ""; for (let i=0;i<3;i++) { const img = document.createElement("img"); img.src=src; img.width=320; img.height=240; document.body.append(img); } }', original_url)
        page.wait_for_timeout(500)
        sw.evaluate('() => chrome.storage.local.set({autoSites:{"127.0.0.1":true}})')
        page.wait_for_timeout(100)
        sw.evaluate('() => chrome.storage.local.set({autoSites:{"127.0.0.1":false}})')
        page.wait_for_function('(src) => [...document.images].some(img => img.src !== src)', arg=original_url)
        sw.evaluate('() => chrome.storage.local.set({autoSites:{"127.0.0.1":true}})')
        page.wait_for_function('(src) => [...document.images].every(img => img.src !== src)', arg=original_url)
        assert len(seen)==5, f"Expected five total jobs (manual, area, and three auto), got {len(seen)}"
        print('PASS Auto pause/resume drains queued pages exactly once')
        ctx.close()
