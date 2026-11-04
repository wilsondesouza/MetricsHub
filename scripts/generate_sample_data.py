"""Gera os bancos SQLite de demonstração do MetricsHub.

Uso:  python scripts/generate_sample_data.py
Os arquivos são criados em sample_data/ e são determinísticos (seed fixa).
"""

from __future__ import annotations

import random
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "sample_data"
SEED = 42
NOW = datetime(2026, 11, 1, 23, 0, tzinfo=timezone.utc)


def build_inventory(path: Path) -> None:
    path.unlink(missing_ok=True)
    random.seed(SEED)
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE suppliers (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            country TEXT,
            email TEXT,
            rating REAL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT
        );
        CREATE TABLE categories (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            parent_id INTEGER REFERENCES categories(id)
        );
        CREATE TABLE products (
            id INTEGER PRIMARY KEY,
            sku TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            category_id INTEGER REFERENCES categories(id),
            supplier_id INTEGER REFERENCES suppliers(id),
            cost NUMERIC(10,2),
            price NUMERIC(10,2),
            stock INTEGER NOT NULL DEFAULT 0,
            discontinued INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            thumbnail BLOB
        );
        CREATE TABLE customers (
            id INTEGER PRIMARY KEY,
            full_name TEXT NOT NULL,
            email TEXT,
            city TEXT,
            state TEXT,
            created_at TEXT
        );
        CREATE TABLE orders (
            id INTEGER PRIMARY KEY,
            customer_id INTEGER NOT NULL REFERENCES customers(id),
            status TEXT NOT NULL,
            channel TEXT,
            total NUMERIC(10,2),
            created_at TEXT NOT NULL
        );
        CREATE TABLE order_items (
            order_id INTEGER NOT NULL REFERENCES orders(id),
            product_id INTEGER NOT NULL REFERENCES products(id),
            quantity INTEGER NOT NULL,
            unit_price NUMERIC(10,2),
            discount REAL DEFAULT 0,
            PRIMARY KEY (order_id, product_id)
        );
        CREATE TABLE inventory_movements (
            id INTEGER PRIMARY KEY,
            product_id INTEGER NOT NULL REFERENCES products(id),
            movement_type TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            occurred_at TEXT NOT NULL,
            warehouse TEXT
        );
        CREATE INDEX idx_orders_created ON orders(created_at);
        CREATE INDEX idx_orders_status ON orders(status);
        CREATE INDEX idx_movements_occurred ON inventory_movements(occurred_at);
        CREATE VIEW v_orders_summary AS
            SELECT date(o.created_at) AS day,
                   COUNT(*) AS orders,
                   SUM(o.total) AS revenue
            FROM orders o GROUP BY date(o.created_at);
        """
    )

    countries = ["Brasil", "Argentina", "Chile", "EUA", "Alemanha", "China", "Índia"]
    suppliers = [
        (i, f"Fornecedor {name}", random.choice(countries),
         f"contato{i}@fornecedor{i}.example", round(random.uniform(2.5, 5), 2),
         int(random.random() > 0.15), (NOW - timedelta(days=random.randint(30, 1200))).isoformat())
        for i, name in enumerate(
            ["Aurora", "Nimbus", "Vertex", "Solaris", "Kappa", "Orion", "Pampa",
             "Andes", "Delta", "Lumen", "Ferro", "Cobre", "Prisma", "Nova", "Zenit",
             "Atlas", "Vega", "Rios", "Horizonte", "Terra"], start=1)
    ]
    conn.executemany("INSERT INTO suppliers VALUES (?,?,?,?,?,?,?)", suppliers)

    categories = [
        (1, "Eletrônicos", None), (2, "Periféricos", 1), (3, "Áudio", 1),
        (4, "Escritório", None), (5, "Papelaria", 4), (6, "Móveis", 4),
        (7, "Limpeza", None), (8, "Cozinha", None),
    ]
    conn.executemany("INSERT INTO categories VALUES (?,?,?)", categories)

    nouns = ["Monitor", "Teclado", "Mouse", "Headset", "Webcam", "Hub USB", "Cadeira",
             "Mesa", "Caderno", "Caneta", "Cafeteira", "Detergente", "Luminária",
             "Suporte", "Cabo", "Adaptador", "Mousepad", "Grampeador"]
    products = []
    for pid in range(1, 241):
        noun = random.choice(nouns)
        cost = round(random.uniform(8, 900), 2)
        price = round(cost * random.uniform(1.15, 2.4), 2)
        products.append(
            (pid, f"SKU-{pid:05d}", f"{noun} {random.choice(['Pro', 'Lite', 'Max', 'Plus', '']).strip() or 'Basic'} {pid}",
             random.randint(1, 8), random.randint(1, 20), cost, price,
             random.randint(0, 800), int(random.random() > 0.88),
             None if random.random() > 0.3 else "Produto com observações de qualidade.",
             bytes(random.getrandbits(8) for _ in range(random.randint(8, 48))))
        )
    conn.executemany("INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?)", products)

    first = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Felipe", "Gabriela", "Heitor",
             "Isabela", "João", "Karen", "Lucas", "Marina", "Nelson", "Olívia", "Pedro",
             "Quésia", "Rafael", "Sofia", "Tiago", "Ursula", "Vitor", "Wagner", "Yara"]
    last = ["Silva", "Souza", "Oliveira", "Pereira", "Costa", "Almeida", "Nunes",
            "Rocha", "Lima", "Araújo", "Fernandes", "Gomes"]
    cities = [("Rio de Janeiro", "RJ"), ("São Paulo", "SP"), ("Belo Horizonte", "MG"),
              ("Curitiba", "PR"), ("Porto Alegre", "RS"), ("Salvador", "BA"),
              ("Recife", "PE"), ("Fortaleza", "CE"), ("Manaus", "AM"), ("Goiânia", "GO")]
    customers = []
    for cid in range(1, 901):
        city, state = random.choice(cities)
        customers.append(
            (cid, f"{random.choice(first)} {random.choice(last)}",
             None if random.random() > 0.92 else f"cliente{cid}@example.com",
             city, state,
             (NOW - timedelta(days=random.randint(1, 1500))).isoformat())
        )
    conn.executemany("INSERT INTO customers VALUES (?,?,?,?,?,?)", customers)

    statuses = ["pending", "paid", "shipped", "delivered", "cancelled", "refunded"]
    weights = [10, 34, 18, 30, 5, 3]
    channels = ["web", "mobile", "loja", "telefone"]
    orders, items, movements = [], [], []
    item_id = 0
    move_id = 0
    for oid in range(1, 4001):
        created = NOW - timedelta(days=random.randint(0, 420), minutes=random.randint(0, 1439))
        status = random.choices(statuses, weights=weights)[0]
        n_items = random.randint(1, 5)
        total = 0.0
        chosen = random.sample(products, k=n_items)
        for product in chosen:
            item_id += 1
            qty = random.randint(1, 6)
            unit = product[6]
            discount = round(random.choice([0, 0, 0, 0.05, 0.1, 0.15]), 2)
            total += unit * qty * (1 - discount)
            items.append((oid, product[0], qty, unit, discount))
            move_id += 1
            movements.append(
                (move_id, product[0], "out", qty, created.isoformat(), random.choice(["CD-SP", "CD-RJ"]))
            )
        orders.append((oid, random.randint(1, 900), status, random.choice(channels),
                       round(total, 2), created.isoformat()))

    conn.executemany("INSERT INTO orders VALUES (?,?,?,?,?,?)", orders)
    conn.executemany("INSERT INTO order_items VALUES (?,?,?,?,?)", items)
    conn.executemany("INSERT INTO inventory_movements VALUES (?,?,?,?,?,?)", movements)

    # Movimentos de entrada ao longo de 2 anos
    for _ in range(1200):
        move_id += 1
        movements = (move_id, random.randint(1, 240), "in", random.randint(5, 120),
                     (NOW - timedelta(days=random.randint(0, 730))).isoformat(),
                     random.choice(["CD-SP", "CD-RJ"]))
        conn.execute("INSERT INTO inventory_movements VALUES (?,?,?,?,?,?)", movements)

    conn.commit()
    conn.close()


def build_telemetry(path: Path) -> None:
    path.unlink(missing_ok=True)
    random.seed(SEED + 1)
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE devices (
            id INTEGER PRIMARY KEY,
            hostname TEXT NOT NULL,
            location TEXT,
            agent_version TEXT,
            installed_at TEXT
        );
        CREATE TABLE sistema_info (
            id INTEGER PRIMARY KEY,
            device_id INTEGER NOT NULL REFERENCES devices(id),
            timestamp TEXT NOT NULL,
            cpu REAL,
            ram REAL,
            temperatura REAL,
            potencia REAL
        );
        CREATE TABLE sistema_info_media (
            id INTEGER PRIMARY KEY,
            device_id INTEGER NOT NULL REFERENCES devices(id),
            timestamp TEXT NOT NULL,
            cpu_media REAL,
            ram_media REAL,
            temperatura_media REAL,
            potencia_media REAL
        );
        CREATE TABLE device_events (
            id INTEGER PRIMARY KEY,
            device_id INTEGER NOT NULL REFERENCES devices(id),
            severity TEXT NOT NULL,
            message TEXT,
            occurred_at TEXT NOT NULL
        );
        CREATE INDEX idx_media_ts ON sistema_info_media(timestamp);
        CREATE INDEX idx_raw_ts ON sistema_info(timestamp);
        """
    )
    devices = [
        (1, "edge-rio-01", "Rio de Janeiro", "2.4.1", "2025-01-12T09:00:00Z"),
        (2, "edge-sp-02", "São Paulo", "2.4.1", "2025-02-03T11:20:00Z"),
        (3, "edge-curitiba-01", "Curitiba", "2.3.9", "2025-03-21T15:45:00Z"),
    ]
    conn.executemany("INSERT INTO devices VALUES (?,?,?,?,?)", devices)

    raw_rows, media_rows, events = [], [], []
    raw_id = 0
    media_id = 0
    start = NOW - timedelta(days=14)
    for step in range(14 * 24 * 12):  # 5 em 5 min por 14 dias
        ts = start + timedelta(minutes=5 * step)
        hour = ts.hour
        peak = 1.0 if 9 <= hour <= 19 else 0.55
        base_cpu = 28 + 30 * peak
        cpu = max(2, min(99, random.gauss(base_cpu, 7)))
        ram = max(300, min(1990, random.gauss(950 + 420 * peak, 90)))
        temp = max(28, min(69, random.gauss(41 + 13 * peak, 2.6)))
        power = max(3.1, min(14.8, random.gauss(6.2 + 4.4 * peak, 0.7)))
        for device_id in (1, 2, 3):
            raw_id += 1
            factor = 1 + (device_id - 1) * 0.06
            raw_rows.append(
                (raw_id, device_id, ts.isoformat(), round(cpu * factor, 2),
                 round(ram, 2), round(temp + (device_id - 1) * 1.2, 2),
                 round(power * factor, 2))
            )
        if step % 6 == 0:  # média a cada 30 min
            media_id += 1
            media_rows.append(
                (media_id, 1, ts.isoformat(), round(cpu, 2), round(ram, 2),
                 round(temp, 2), round(power, 2))
            )
        if random.random() < 0.004:
            events.append(
                (len(events) + 1, random.randint(1, 3),
                 random.choice(["info", "warning", "error"]),
                 random.choice(["Reconexão do agente", "Pico de temperatura",
                                "Falha ao enviar lote", "Atualização aplicada",
                                "Uso de disco acima de 85%"]),
                 ts.isoformat())
            )

    conn.executemany("INSERT INTO sistema_info VALUES (?,?,?,?,?,?,?)", raw_rows)
    conn.executemany("INSERT INTO sistema_info_media VALUES (?,?,?,?,?,?,?)", media_rows)
    conn.executemany("INSERT INTO device_events VALUES (?,?,?,?,?)", events)
    conn.commit()
    conn.close()


def build_analytics(path: Path) -> None:
    path.unlink(missing_ok=True)
    random.seed(SEED + 2)
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE sessions (
            id INTEGER PRIMARY KEY,
            visitor_id TEXT,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            country TEXT,
            device TEXT,
            duration_seconds INTEGER,
            is_bounce INTEGER
        );
        CREATE TABLE events (
            id INTEGER PRIMARY KEY,
            session_id INTEGER REFERENCES sessions(id),
            name TEXT NOT NULL,
            path TEXT,
            occurred_at TEXT NOT NULL,
            properties TEXT
        );
        CREATE TABLE "order details" (
            id INTEGER PRIMARY KEY,
            "order id" INTEGER,
            "product name" TEXT,
            quantity INTEGER,
            amount REAL,
            status TEXT,
            shipped_at TEXT
        );
        CREATE TABLE "Tabela Ação" (
            id INTEGER PRIMARY KEY,
            "descrição" TEXT,
            "valor" REAL,
            "data" TEXT
        );
        CREATE INDEX idx_events_ts ON events(occurred_at);
        CREATE INDEX idx_sessions_started ON sessions(started_at);
        """
    )
    countries = ["BR", "PT", "US", "AR", "MX", "ES", "DE"]
    pages = ["/", "/produtos", "/precos", "/blog/metricas", "/docs", "/contato", "/checkout"]
    event_names = ["page_view", "signup", "login", "add_to_cart", "purchase", "search", "download"]
    sessions, events = [], []
    event_id = 0
    for sid in range(1, 5001):
        started = NOW - timedelta(days=random.randint(0, 180), minutes=random.randint(0, 1439))
        duration = random.choice([0, 12, 35, 80, 140, 320, 610, 1200, None])
        sessions.append(
            (sid, f"visitor-{random.randint(1, 2500):05d}", started.isoformat(),
             (started + timedelta(seconds=duration or 0)).isoformat(),
             random.choice(countries), random.choice(["desktop", "mobile", "tablet"]),
             duration, int((duration or 0) < 30))
        )
        for _ in range(random.randint(1, 6)):
            event_id += 1
            events.append(
                (event_id, sid, random.choice(event_names), random.choice(pages),
                 (started + timedelta(seconds=random.randint(0, 1800))).isoformat(),
                 '{"utm_source":"newsletter","experiment":"B"}' if random.random() < 0.2 else None)
            )
    conn.executemany("INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?)", sessions)
    conn.executemany("INSERT INTO events VALUES (?,?,?,?,?,?)", events)

    details = []
    for oid in range(1, 801):
        details.append(
            (oid, random.randint(1, 300), f"Plano {random.choice(['Start', 'Pro', 'Scale', 'Enterprise'])}",
             random.randint(1, 5), round(random.uniform(19, 2400), 2),
             random.choice(["paid", "pending", "refunded"]),
             None if random.random() > 0.5 else
             (NOW - timedelta(days=random.randint(0, 90))).isoformat())
        )
    conn.executemany('INSERT INTO "order details" VALUES (?,?,?,?,?,?,?)', details)

    acao = [
        (i, random.choice(["Entrada de mercadoria", "Ajuste de inventário", "Devolução",
                           "Transferência entre filiais", "Perda"]),
         round(random.uniform(10, 5000), 2),
         (NOW - timedelta(days=random.randint(0, 240))).date().isoformat())
        for i in range(1, 301)
    ]
    conn.executemany('INSERT INTO "Tabela Ação" VALUES (?,?,?,?)', acao)
    conn.commit()
    conn.close()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    build_inventory(OUT / "inventory_example.db")
    build_telemetry(OUT / "telemetry_demo.db")
    build_analytics(OUT / "analytics_sandbox.db")
    for file in sorted(OUT.glob("*.db")):
        print(f"✓ {file.name}: {file.stat().st_size / 1024:.0f} KiB")


if __name__ == "__main__":
    main()
