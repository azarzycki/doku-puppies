"""Query a `uiautomator dump` (the WebView exposes its page as nodes with text / content-desc).
   ui.py has <dump.xml> <text>     exit 0 if some node's text or description contains <text> (case-insensitive)
   ui.py center <dump.xml> <text>  print "x y" of the first such node, for `adb shell input tap`"""
import re
import sys
import xml.etree.ElementTree as ET

cmd, path, needle = sys.argv[1], sys.argv[2], sys.argv[3].lower()
try:
    root = ET.parse(path).getroot()
except Exception as e:  # an empty or truncated dump
    print('bad dump:', e, file=sys.stderr)
    sys.exit(2)
hits = [n for n in root.iter('node') if needle in ((n.get('text') or '') + ' ' + (n.get('content-desc') or '')).lower()]
if cmd == 'has':
    sys.exit(0 if hits else 1)
if cmd == 'center':
    if not hits:
        sys.exit(1)
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', hits[0].get('bounds')))
    print((x1 + x2) // 2, (y1 + y2) // 2)
