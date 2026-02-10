"""
Utilidades para generación de PDFs profesionales
==================================================

Módulo independiente para generar PDFs con estilo profesional:
- Cabecera con logo/nombre empresa
- Pie de página con numeración
- Fecha de generación
- Estilos consistentes
"""
from io import BytesIO
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from typing import List, Dict, Any, Optional
from reportlab.pdfgen import canvas


class NumberedCanvas:
    """Canvas con numeración de páginas"""
    def __init__(self, canvas_obj, doc):
        self.canvas = canvas_obj
        self.doc = doc
        
    def draw_page_number(self, page_num):
        """Dibuja número de página en el pie"""
        self.canvas.saveState()
        self.canvas.setFont("Helvetica", 9)
        page_text = f"Página {page_num}"
        self.canvas.drawCentredString(A4[0] / 2.0, 0.75 * inch, page_text)
        self.canvas.restoreState()


def create_sunat_pdf(
    company_name: str,
    company_ruc: Optional[str],
    report_title: str,
    headers: List[str],
    rows: List[List[str]],
    period: Optional[str] = None,
    footer_text: Optional[str] = None
) -> BytesIO:
    """
    Crea un PDF con formato SUNAT (libro electrónico) usando fuente Courier New a 10px.
    Formato tipo texto plano con alineación fija para simular libro electrónico.
    
    Args:
        company_name: Nombre de la empresa
        company_ruc: RUC de la empresa
        report_title: Título del reporte
        headers: Lista de encabezados de columnas
        rows: Lista de filas de datos
        period: Período del reporte (YYYY-MM)
        footer_text: Texto adicional para el pie de página
    
    Returns:
        BytesIO con el contenido del PDF
    """
    buffer = BytesIO()
    
    # Usar formato apaisado (landscape)
    page_size = landscape(A4)
    
    # Anchos de columna fijos para alineación tipo libro electrónico (ajustados para formato apaisado)
    col_widths = [0.7*inch, 1*inch, 3.5*inch, 1*inch, 2*inch, 1.2*inch, 1.2*inch]
    
    # Función para cabecera y pie de página
    def on_first_page(canvas_obj, doc):
        canvas_obj.saveState()
        
        # Cabecera con fuente Courier New
        canvas_obj.setFont("Courier-Bold", 10)
        canvas_obj.setFillColor(colors.black)
        canvas_obj.drawCentredString(page_size[0] / 2.0, page_size[1] - 0.7*inch, report_title)
        
        canvas_obj.setFont("Courier", 8)
        canvas_obj.drawCentredString(page_size[0] / 2.0, page_size[1] - 0.85*inch, company_name)
        
        if company_ruc:
            canvas_obj.drawCentredString(page_size[0] / 2.0, page_size[1] - 0.95*inch, f"RUC: {company_ruc}")
        
        if period:
            canvas_obj.drawCentredString(page_size[0] / 2.0, page_size[1] - 1.05*inch, f"PERÍODO: {period}")
        
        # Línea separadora
        canvas_obj.setStrokeColor(colors.black)
        canvas_obj.setLineWidth(1)
        canvas_obj.line(0.5*inch, page_size[1] - 1.15*inch, page_size[0] - 0.5*inch, page_size[1] - 1.15*inch)
        
        # Pie de página
        canvas_obj.setFont("Courier", 7)
        canvas_obj.setFillColor(colors.grey)
        date_str = datetime.now().strftime('%d/%m/%Y %H:%M')
        canvas_obj.drawString(0.5*inch, 0.5*inch, f"Generado el {date_str}")
        if footer_text:
            canvas_obj.drawCentredString(page_size[0] / 2.0, 0.5*inch, footer_text)
        canvas_obj.drawRightString(page_size[0] - 0.5*inch, 0.5*inch, "Página 1")
        
        canvas_obj.restoreState()
    
    def on_later_pages(canvas_obj, doc):
        canvas_obj.saveState()
        
        # Pie de página para páginas siguientes
        canvas_obj.setFont("Courier", 7)
        canvas_obj.setFillColor(colors.grey)
        date_str = datetime.now().strftime('%d/%m/%Y %H:%M')
        canvas_obj.drawString(0.5*inch, 0.5*inch, f"Generado el {date_str}")
        if footer_text:
            canvas_obj.drawCentredString(page_size[0] / 2.0, 0.5*inch, footer_text)
        page_num = canvas_obj.getPageNumber()
        canvas_obj.drawRightString(page_size[0] - 0.5*inch, 0.5*inch, f"Página {page_num}")
        
        canvas_obj.restoreState()
    
    doc = SimpleDocTemplate(
        buffer,
        pagesize=page_size,
        rightMargin=0.5*inch,
        leftMargin=0.5*inch,
        topMargin=1.3*inch,
        bottomMargin=1*inch
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Estilo Courier New para datos tipo libro electrónico
    courier_style = ParagraphStyle(
        'CourierData',
        parent=styles['Normal'],
        fontSize=8,
        fontName='Courier',
        leading=10,
        textColor=colors.black,
        alignment=TA_LEFT
    )
    
    courier_bold_style = ParagraphStyle(
        'CourierBold',
        parent=styles['Normal'],
        fontSize=8,
        fontName='Courier-Bold',
        leading=10,
        textColor=colors.black,
        alignment=TA_LEFT
    )
    
    # Preparar tabla con formato Courier New
    table_data_formatted = []
    
    # Headers con Courier-Bold
    header_paragraphs = [Paragraph(str(h), courier_bold_style) for h in headers]
    table_data_formatted.append(header_paragraphs)
    
    # Filas de datos con Courier normal
    for row in rows:
        formatted_row = []
        for i, cell in enumerate(row):
            cell_str = str(cell) if cell is not None else ""
            # Usar negrita para la fila de totales
            if cell_str == "TOTALES" or (i == 0 and cell_str == "TOTALES"):
                formatted_row.append(Paragraph(cell_str, courier_bold_style))
            elif i in [5, 6]:  # Columnas Debe y Haber - usar estilo con alineación derecha
                # Crear estilo específico para números alineados a la derecha
                number_style = ParagraphStyle(
                    'CourierNumber',
                    parent=courier_style,
                    alignment=TA_RIGHT
                )
                formatted_row.append(Paragraph(cell_str, number_style))
            else:
                formatted_row.append(Paragraph(cell_str, courier_style))
        table_data_formatted.append(formatted_row)
    
    table = Table(table_data_formatted, colWidths=col_widths, repeatRows=1)
    
    # Estilo tipo libro electrónico SUNAT
    table_style = TableStyle([
        # Headers
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f0f0f0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
        ('ALIGN', (0, 0), (-1, 0), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Courier-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ('TOPPADDING', (0, 0), (-1, 0), 6),
        ('GRID', (0, 0), (-1, 0), 1, colors.black),
        
        # Datos
        ('BACKGROUND', (0, 1), (-1, -2), colors.white),
        ('TEXTCOLOR', (0, 1), (-1, -2), colors.black),
        ('FONTNAME', (0, 1), (-1, -2), 'Courier'),
        ('FONTSIZE', (0, 1), (-1, -2), 8),
        ('LEADING', (0, 1), (-1, -2), 10),
        ('ALIGN', (0, 1), (-1, -2), 'LEFT'),
        ('VALIGN', (0, 1), (-1, -2), 'TOP'),
        ('GRID', (0, 1), (-1, -2), 0.5, colors.grey),
        
        # Alinear números a la derecha (Debe y Haber)
        ('ALIGN', (5, 1), (6, -2), 'RIGHT'),
        
        # Fila de totales
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#e0e0e0')),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.black),
        ('FONTNAME', (0, -1), (-1, -1), 'Courier-Bold'),
        ('FONTSIZE', (0, -1), (-1, -1), 8),
        ('ALIGN', (0, -1), (4, -1), 'LEFT'),
        ('ALIGN', (5, -1), (6, -1), 'RIGHT'),
        ('GRID', (0, -1), (-1, -1), 1, colors.black),
        ('TOPPADDING', (0, -1), (-1, -1), 6),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 6),
    ])
    
    table.setStyle(table_style)
    elements.append(table)
    
    # Verificar que hay elementos para construir
    if not elements:
        raise ValueError("No hay elementos para construir el PDF")
    
    # Construir PDF
    try:
        doc.build(elements, onFirstPage=on_first_page, onLaterPages=on_later_pages)
    except Exception as e:
        raise ValueError(f"Error al construir PDF: {str(e)}")
    
    # Obtener el contenido del buffer
    buffer.seek(0)
    buffer_content = buffer.read()
    buffer.seek(0)
    
    # Verificar que el buffer tiene contenido después de construir
    buffer_size = len(buffer_content)
    if buffer_size == 0:
        raise ValueError("El PDF generado está vacío. No se pudo construir el documento.")
    
    # Crear un nuevo BytesIO con el contenido para evitar problemas de posición del buffer
    result_buffer = BytesIO(buffer_content)
    result_buffer.seek(0)
    
    return result_buffer


def create_professional_pdf(
    company_name: str,
    company_ruc: Optional[str],
    report_title: str,
    data_tables: List[Dict[str, Any]],
    report_subtitle: Optional[str] = None,
    period: Optional[str] = None,
    footer_text: Optional[str] = None
) -> BytesIO:
    """
    Crea un PDF profesional con cabecera, pie de página y numeración.
    
    Args:
        company_name: Nombre de la empresa
        company_ruc: RUC de la empresa
        report_title: Título del reporte
        report_subtitle: Subtítulo opcional
        period: Período del reporte (YYYY-MM)
        data_tables: Lista de tablas con estructura:
            {
                "title": "Título de la sección",
                "headers": ["Col1", "Col2", ...],
                "rows": [["dato1", "dato2", ...], ...],
                "col_widths": [1.5*inch, 4*inch, ...],  # opcional
                "style": [...]  # opcional, personalización adicional
            }
        footer_text: Texto adicional para el pie de página
    
    Returns:
        BytesIO con el contenido del PDF
    """
    buffer = BytesIO()
    
    # Función para cabecera y pie de página
    def on_first_page(canvas_obj, doc):
        canvas_obj.saveState()
        
        # Cabecera
        canvas_obj.setFont("Helvetica-Bold", 16)
        canvas_obj.setFillColor(colors.HexColor('#1a56db'))
        canvas_obj.drawCentredString(A4[0] / 2.0, A4[1] - 1*inch, company_name)
        
        if company_ruc:
            canvas_obj.setFont("Helvetica", 10)
            canvas_obj.setFillColor(colors.grey)
            canvas_obj.drawCentredString(A4[0] / 2.0, A4[1] - 1.2*inch, f"RUC: {company_ruc}")
        
        # Línea separadora
        canvas_obj.setStrokeColor(colors.HexColor('#1a56db'))
        canvas_obj.setLineWidth(2)
        canvas_obj.line(0.5*inch, A4[1] - 1.4*inch, A4[0] - 0.5*inch, A4[1] - 1.4*inch)
        
        # Pie de página
        canvas_obj.setFont("Helvetica", 8)
        canvas_obj.setFillColor(colors.grey)
        date_str = datetime.now().strftime('%d/%m/%Y %H:%M')
        canvas_obj.drawString(0.5*inch, 0.5*inch, f"Generado el {date_str}")
        if footer_text:
            canvas_obj.drawCentredString(A4[0] / 2.0, 0.5*inch, footer_text)
        canvas_obj.drawRightString(A4[0] - 0.5*inch, 0.5*inch, "Página 1")
        
        canvas_obj.restoreState()
    
    def on_later_pages(canvas_obj, doc):
        canvas_obj.saveState()
        
        # Pie de página para páginas siguientes
        canvas_obj.setFont("Helvetica", 8)
        canvas_obj.setFillColor(colors.grey)
        date_str = datetime.now().strftime('%d/%m/%Y %H:%M')
        canvas_obj.drawString(0.5*inch, 0.5*inch, f"Generado el {date_str}")
        if footer_text:
            canvas_obj.drawCentredString(A4[0] / 2.0, 0.5*inch, footer_text)
        page_num = canvas_obj.getPageNumber()
        canvas_obj.drawRightString(A4[0] - 0.5*inch, 0.5*inch, f"Página {page_num}")
        
        canvas_obj.restoreState()
    
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=0.5*inch,
        leftMargin=0.5*inch,
        topMargin=1.6*inch,
        bottomMargin=1*inch
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Estilos personalizados
    title_style = ParagraphStyle(
        'ReportTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.HexColor('#1a56db'),
        spaceAfter=12,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    subtitle_style = ParagraphStyle(
        'ReportSubtitle',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.grey,
        spaceAfter=18,
        alignment=TA_CENTER,
        fontName='Helvetica'
    )
    
    section_title_style = ParagraphStyle(
        'SectionTitle',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.black,
        spaceAfter=10,
        spaceBefore=12,
        fontName='Helvetica-Bold'
    )
    
    # Título del reporte
    elements.append(Paragraph(report_title, title_style))
    
    # Subtítulo (período, etc.)
    if report_subtitle:
        elements.append(Paragraph(report_subtitle, subtitle_style))
    elif period:
        period_str = f"Período: {period}"
        elements.append(Paragraph(period_str, subtitle_style))
    
    elements.append(Spacer(1, 0.2*inch))
    
    # Generar tablas
    for table_data in data_tables:
        # Título de sección (si existe)
        if table_data.get("title"):
            elements.append(Paragraph(table_data["title"], section_title_style))
        
        # Preparar datos de la tabla
        headers = table_data["headers"]
        rows = table_data["rows"]
        col_widths = table_data.get("col_widths", None)
        
        # Si no se especifican anchos, calcular automáticamente
        if not col_widths:
            num_cols = len(headers)
            available_width = A4[0] - 1*inch
            col_width = available_width / num_cols
            col_widths = [col_width] * num_cols
        
        # Crear tabla convirtiendo HTML a Paragraphs
        table_data_formatted = []
        
        # Headers como Paragraphs
        header_paragraphs = [Paragraph(str(h), styles['Normal']) for h in headers]
        table_data_formatted.append(header_paragraphs)
        
        for row in rows:
            formatted_row = []
            for cell in row:
                if isinstance(cell, str):
                    # Si contiene HTML (como <b>), crear Paragraph
                    if "<b>" in cell or "<br/>" in cell or any(tag in cell for tag in ["<", ">"]):
                        formatted_row.append(Paragraph(cell, styles['Normal']))
                    else:
                        formatted_row.append(Paragraph(str(cell), styles['Normal']))
                elif isinstance(cell, (int, float)):
                    formatted_row.append(Paragraph(f"{cell:,.2f}", styles['Normal']))
                else:
                    formatted_row.append(Paragraph(str(cell), styles['Normal']))
            table_data_formatted.append(formatted_row)
        
        table = Table(table_data_formatted, colWidths=col_widths, repeatRows=1)
        
        # Estilo base
        table_style = TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#366092')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),  # Usar string, no constante
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
        ])
        
        # Alineación de números (derecha) - usar strings para alineación
        num_cols = len(headers)
        for col in range(num_cols):
            # Intentar detectar columnas numéricas basándose en el contenido
            is_numeric = False
            for row in rows:
                if col < len(row):
                    cell_val = row[col]
                    if isinstance(cell_val, (int, float)):
                        is_numeric = True
                        break
                    elif isinstance(cell_val, str) and cell_val.replace(',', '').replace('.', '').replace('-', '').isdigit():
                        is_numeric = True
                        break
            if is_numeric:
                table_style.add('ALIGN', (col, 1), (col, -1), 'RIGHT')  # Usar string
        
        # Aplicar estilos adicionales si se especifican
        if table_data.get("style"):
            custom_style = table_data["style"]
            for style_cmd in custom_style:
                table_style.add(*style_cmd)
        
        table.setStyle(table_style)
        elements.append(table)
        
        # Espacio después de la tabla
        elements.append(Spacer(1, 0.3*inch))
    
    # Verificar que hay elementos para construir
    if not elements:
        raise ValueError("No hay elementos para construir el PDF")
    
    # Construir PDF
    try:
        doc.build(elements, onFirstPage=on_first_page, onLaterPages=on_later_pages)
    except Exception as e:
        raise ValueError(f"Error al construir PDF: {str(e)}")
    
    # Obtener el contenido del buffer
    buffer.seek(0)
    buffer_content = buffer.read()
    buffer.seek(0)
    
    # Verificar que el buffer tiene contenido después de construir
    buffer_size = len(buffer_content)
    if buffer_size == 0:
        raise ValueError("El PDF generado está vacío. No se pudo construir el documento.")
    
    # Crear un nuevo BytesIO con el contenido para evitar problemas de posición del buffer
    result_buffer = BytesIO(buffer_content)
    result_buffer.seek(0)
    
    return result_buffer
