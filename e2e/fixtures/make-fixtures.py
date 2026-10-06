# パスワード付き PDF（password.pdf）を作ります：python3 e2e/fixtures/make-fixtures.py（pypdf が必要）
from pathlib import Path
from pypdf import PdfReader, PdfWriter

d = Path(__file__).parent
w = PdfWriter()
for p in PdfReader(d / 'text-3pages.pdf').pages[:1]:
    w.add_page(p)
w.encrypt(user_password='secret', owner_password='owner', algorithm='RC4-128')
with open(d / 'password.pdf', 'wb') as f:
    w.write(f)
