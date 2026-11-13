from PIL import Image, ImageDraw
from docx import Document
from docx.shared import Inches
import os
base = os.path.dirname(os.path.abspath(__file__))
os.makedirs(base, exist_ok=True)
# images
for name, color, text in [('red.png',(220,60,70),'A'),('blue.png',(50,120,220),'B'),('stem.png',(40,170,120),'STEM')]:
    img = Image.new('RGB',(260,120),'white')
    d = ImageDraw.Draw(img)
    d.rectangle([6,6,253,113], fill=color)
    d.text((20,45), text, fill='white')
    img.save(os.path.join(base,name))
doc = Document()
doc.add_heading('图片题测试', level=1)
p = doc.add_paragraph('1. 观察下面的图片，选择正确的说法（ ）')
p = doc.add_paragraph('A. 红色方块：')
p.add_run().add_picture(os.path.join(base,'red.png'), width=Inches(1.6))
p = doc.add_paragraph('B. 蓝色方块：')
p.add_run().add_picture(os.path.join(base,'blue.png'), width=Inches(1.6))
doc.add_paragraph('C. 以上都不对')
doc.add_paragraph('D. 无法判断')
doc.add_paragraph('')
p = doc.add_paragraph('2. 根据题干图片判断（ ）')
p.add_run().add_picture(os.path.join(base,'stem.png'), width=Inches(1.2))
doc.add_paragraph('A. 正确')
doc.add_paragraph('B. 错误')
doc.add_paragraph('')
doc.add_paragraph('答案：1.A 2.A')
doc.add_paragraph('解析：第一题选红色方块；第二题见图。')
# table question
doc.add_paragraph('3. 表格中的选项（ ）')
table = doc.add_table(rows=2, cols=2)
table.cell(0,0).text = 'A. 甲'
table.cell(0,1).text = 'B. 乙'
table.cell(1,0).text = 'C. 丙'
table.cell(1,1).text = 'D. 丁'
out = os.path.join(base,'图片题测试.docx')
doc.save(out)
print(out, os.path.getsize(out))
