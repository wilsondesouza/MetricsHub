from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import sqlite3
import json
import os
from datetime import datetime
import pathlib

# === Caminhos principais ===
base_dir = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(base_dir, "."))
CONFIG_PATH = os.path.join(ROOT_DIR, "config", "settings.json")

# === Leitura do settings.json ===
with open(CONFIG_PATH, encoding="utf-8") as f:
    settings = json.load(f)

PORT = settings.get("port", 7050)


app = Flask(__name__, static_folder=os.path.join(base_dir, 'static'), static_url_path='')
CORS(app)

# Load configuration
with open(os.path.join(base_dir, 'config.json'), 'r') as f:
    config = json.load(f)

DATABASES = {}
for name, path in config['databases'].items():
    resolved = os.path.normpath(os.path.join(base_dir, path))
    DATABASES[name] = resolved

def get_db_connection(db_name):
    """Create a database connection"""
    if db_name not in DATABASES:
        return None
    db_path = DATABASES[db_name]
    if not os.path.exists(db_path):
        return None
    return sqlite3.connect(db_path)

@app.route('/')
def index():
    """Serve the main HTML page"""
    return send_from_directory(base_dir, 'index.html')

@app.route('/api/databases', methods=['GET'])
def get_databases():
    """Get list of available databases"""
    db_list = []
    for name, path in DATABASES.items():
        exists = os.path.exists(path)
        db_list.append({
            'name': name,
            'path': path,
            'exists': exists
        })
    return jsonify(db_list)

@app.route('/api/tables/<db_name>', methods=['GET'])
def get_tables(db_name):
    """Get list of tables in a database"""
    conn = get_db_connection(db_name)
    if not conn:
        return jsonify({'error': 'Database not found'}), 404
    
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        tables = [row[0] for row in cursor.fetchall()]
        conn.close()
        return jsonify(tables)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/table-info/<db_name>/<table_name>', methods=['GET'])
def get_table_info(db_name, table_name):
    """Get table schema and row count"""
    conn = get_db_connection(db_name)
    if not conn:
        return jsonify({'error': 'Database not found'}), 404
    
    try:
        cursor = conn.cursor()
        
        # Get column information
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = []
        for row in cursor.fetchall():
            columns.append({
                'cid': row[0],
                'name': row[1],
                'type': row[2],
                'notnull': row[3],
                'default': row[4],
                'pk': row[5]
            })
        
        # Get row count
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        row_count = cursor.fetchone()[0]
        
        conn.close()
        return jsonify({
            'columns': columns,
            'row_count': row_count
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/query/<db_name>/<table_name>', methods=['GET'])
def query_table(db_name, table_name):
    """Query table data with pagination"""
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', config['pagination']['rows_per_page']))
    
    conn = get_db_connection(db_name)
    if not conn:
        return jsonify({'error': 'Database not found'}), 404
    
    try:
        cursor = conn.cursor()
        
        # Get column names
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = [row[1] for row in cursor.fetchall()]
        
        # Get total count
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        total = cursor.fetchone()[0]
        
        # Get paginated data
        offset = (page - 1) * per_page
        cursor.execute(f"SELECT * FROM {table_name} LIMIT ? OFFSET ?", (per_page, offset))
        rows = cursor.fetchall()
        
        # Convert to list of dictionaries
        data = []
        for row in rows:
            data.append(dict(zip(columns, row)))
        
        conn.close()
        return jsonify({
            'columns': columns,
            'data': data,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'pages': (total + per_page - 1) // per_page
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/dashboard/<db_name>', methods=['GET'])
def get_dashboard_stats(db_name):
    """Get dashboard statistics for a database"""
    conn = get_db_connection(db_name)
    if not conn:
        return jsonify({'error': 'Database not found'}), 404
    
    try:
        cursor = conn.cursor()
        
        # Get all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        tables = [row[0] for row in cursor.fetchall()]
        
        stats = {
            'database': db_name,
            'table_count': len(tables),
            'tables': []
        }
        
        # Get stats for each table
        for table in tables:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            row_count = cursor.fetchone()[0]
            
            # Get column count
            cursor.execute(f"PRAGMA table_info({table})")
            column_count = len(cursor.fetchall())
            
            stats['tables'].append({
                'name': table,
                'rows': row_count,
                'columns': column_count
            })
        
        conn.close()
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chart-data/<db_name>/<table_name>', methods=['GET'])
def get_chart_data(db_name, table_name):
    """Get data for charts - row count trends"""
    conn = get_db_connection(db_name)
    if not conn:
        return jsonify({'error': 'Database not found'}), 404
    
    try:
        cursor = conn.cursor()
        
        # Get column info to find date/timestamp columns
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = cursor.fetchall()
        
        date_column = None
        for col in columns:
            col_name = col[1].lower()
            if 'date' in col_name or 'time' in col_name or 'created' in col_name:
                date_column = col[1]
                break
        
        chart_data = {'labels': [], 'values': []}
        
        if date_column:
            # Group by date if date column exists
            query = f"""
                SELECT DATE({date_column}) as date, COUNT(*) as count 
                FROM {table_name} 
                WHERE {date_column} IS NOT NULL
                GROUP BY DATE({date_column}) 
                ORDER BY date DESC 
                LIMIT 30
            """
            cursor.execute(query)
            results = cursor.fetchall()
            
            for row in reversed(results):
                chart_data['labels'].append(row[0] if row[0] else 'Unknown')
                chart_data['values'].append(row[1])
        else:
            # If no date column, just show total count
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            total = cursor.fetchone()[0]
            chart_data['labels'] = [table_name]
            chart_data['values'] = [total]
        
        conn.close()
        return jsonify(chart_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/metrics-comparison/<db_name>', methods=['GET'])
def get_metrics_comparison(db_name):
    """Get metrics comparison data for sistema_info_media table"""
    conn = get_db_connection(db_name)
    if not conn:
        return jsonify({'error': 'Database not found'}), 404
    
    try:
        cursor = conn.cursor()
        
        # Verifica se a tabela existe
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='sistema_info_media'
        """)
        if not cursor.fetchone():
            return jsonify({'error': 'Table sistema_info_media not found'}), 404
        
        # Busca as últimas 20 médias (aproximadamente 3h20min de dados)
        cursor.execute("""
            SELECT 
                id,
                timestamp,
                cpu_media,
                ram_media,
                temperatura_media,
                potencia_media
            FROM sistema_info_media
            ORDER BY timestamp DESC
            LIMIT 144
        """)
        results = cursor.fetchall()
        
        # Organiza os dados para o gráfico
        data = {
            'labels': [],
            'datasets': {
                'cpu': [],
                'ram': [],
                'temperatura': [],
                'potencia': []
            }
        }
        
        # Inverte para ordem cronológica
        for row in reversed(results):
            # Formata timestamp para exibição (HH:MM)
            timestamp = row[1]
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                label = dt.strftime('%H:%M')
            except:
                label = timestamp[-8:-3] if len(timestamp) > 8 else timestamp
            
            data['labels'].append(label)
            data['datasets']['cpu'].append(round(row[2], 2) if row[2] else 0)
            data['datasets']['ram'].append(round(row[3], 2) if row[3] else 0)
            data['datasets']['temperatura'].append(round(row[4], 2) if row[4] else 0)
            data['datasets']['potencia'].append(round(row[5], 2) if row[5] else 0)
        
        conn.close()
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/current-metrics/<db_name>', methods=['GET'])
def get_current_metrics(db_name):
    """Get current/latest metrics for gauges"""
    conn = get_db_connection(db_name)
    if not conn:
        return jsonify({'error': 'Database not found'}), 404
    
    try:
        cursor = conn.cursor()
        
        # Verifica se a tabela existe
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='sistema_info_media'
        """)
        if not cursor.fetchone():
            return jsonify({'error': 'Table sistema_info_media not found'}), 404
        
        # Busca a última amostra (mais recente)
        cursor.execute("""
            SELECT 
                cpu_media,
                ram_media,
                temperatura_media,
                potencia_media,
                timestamp
            FROM sistema_info_media
            ORDER BY timestamp DESC
            LIMIT 1
        """)
        result = cursor.fetchone()
        
        if not result:
            return jsonify({'error': 'No data available'}), 404
        
        data = {
            'cpu': round(result[0], 2) if result[0] else 0,
            'ram': round(result[1], 2) if result[1] else 0,
            'temperatura': round(result[2], 2) if result[2] else 0,
            'potencia': round(result[3], 2) if result[3] else 0,
            'timestamp': result[4]
        }
        
        conn.close()
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500    

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=PORT)