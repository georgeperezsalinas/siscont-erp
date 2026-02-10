import xlrd
import sys

try:
    wb = xlrd.open_workbook('docs/SUNAT_Plantillas/Estructura del PLE.xls')
    print('Hojas:', wb.sheet_names())
    print('\n' + '='*80)
    
    for sheet_name in wb.sheet_names():
        ws = wb.sheet_by_name(sheet_name)
        print(f'\n=== HOJA: {sheet_name} ===')
        print(f'Dimensiones: {ws.nrows} filas x {ws.ncols} columnas\n')
        
        # Leer primeras 150 filas con contenido
        rows_read = 0
        for i in range(min(ws.nrows, 200)):
            values = []
            for j in range(min(ws.ncols, 25)):
                cell_value = ws.cell_value(i, j)
                if cell_value:
                    values.append(str(cell_value)[:80])
                else:
                    values.append("")
            
            if any(v.strip() for v in values):
                print(f'Fila {i+1}: {" | ".join(values[:15])}')
                rows_read += 1
                if rows_read >= 150:
                    break
        print(f'\nTotal filas con contenido mostradas: {rows_read}')
    
except Exception as e:
    print(f'Error: {e}', file=sys.stderr)
    import traceback
    traceback.print_exc()

