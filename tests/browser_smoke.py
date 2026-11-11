import base64,io,json,struct,threading,time,tempfile,os
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright

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
        popup.locator('#checkEngine').click();popup.wait_for_function("document.querySelector('#status').textContent.includes('Server lokal terhubung')")
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
        page.bring_to_front();page.mouse.move(400,60);page.wait_for_timeout(300)
        # CDP pierces the closed shadow root to exercise the actual toolbar controls.
        cdp=ctx.new_cdp_session(page)
        def find_buttons(node):
            found=[]
            if node.get('nodeName')=='BUTTON': found.append(node)
            for key in ['children','shadowRoots']:
                for child in node.get(key,[]):found+=find_buttons(child)
            return found
        buttons=find_buttons(cdp.send('DOM.getDocument',{'depth':-1,'pierce':True})['root'])
        original_button=next(b for b in buttons if any(c.get('nodeValue')=='Original' for c in b.get('children',[])))
        model=cdp.send('DOM.getBoxModel',{'nodeId':original_button['nodeId']})['model']['content']
        x=(model[0]+model[4])/2;y=(model[1]+model[5])/2
        page.mouse.click(x,y);page.wait_for_timeout(200);assert page.locator('#page').get_attribute('src')==original_url
        page.mouse.click(x,y);page.wait_for_timeout(200);assert page.locator('#page').get_attribute('src')==translated
        page.mouse.move(x,y);page.mouse.down();page.wait_for_timeout(400);assert page.locator('#page').get_attribute('src')==original_url
        page.mouse.up();page.wait_for_timeout(200);assert page.locator('#page').get_attribute('src')==translated
        print('PASS toolbar short click and press-and-hold')
        print('PASS popup has no API-key controls')
        ctx.close()
