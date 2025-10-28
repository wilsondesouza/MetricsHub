# MetricsHub 🗄️

---

<img  alt="Dashboard" height="506px" width="900px" src="static\assets\images\example\dashboard.png">
  <img alt="Visualizador de Dados" height="506px" width="900px" src="static\assets\images\example\data.png">

---

## Sumário do Projeto 📰 

O projeto DBVisualizer é uma aplicação web desenvolvida para servir como visualizador de bancos de dados SQLite. Ele permite que os usuários visualizem dados brutos de tabelas e fornece um painel para visualizar tendências e estatísticas de dados. A aplicação foi desenvolvida usando Flask como backend e utiliza HTML, CSS e JavaScript como frontend, oferecendo uma interface de usuário moderna semelhante a ferramentas como PgAdmin, DB Browser para SQLite e Grafana.


---
## Descrição do Módulo do Projeto 📝

- **Backend (Flask)**: Gerencia conexões de banco de dados, endpoints de API para recuperação de tabelas e dados, além de estatísticas do painel.
- **Frontend (HTML/CSS/JS)**: Fornece uma interface amigável para seleção de banco de dados, navegação em tabelas e visualização de dados.

##  Estruturação 🧱

```
    DBVisualizer/
    ├── app.py                 # Servidor backend Flask
    ├── requirements.txt       # Dependências
    ├── config.json            # Configuração de banco de dados
    ├── index.html             # Página principal HTML 
    ├── static/
        ├── style.css              # Estilização
        └── script.js              # Lógica do Frontend
```

---

## Descrição dos arquivos 📚

- **app.py**: Aplicativo Flask, que manipula conexões de banco de dados e solicitações de API.
- **requirements.txt**: Lista as dependências do Python necessárias para o projeto.
- **config.json**: Contém caminhos para os bancos de dados SQLite e definições de configuração.
- **index.html**: A interface de usuário principal do aplicativo.
- **style.css**: Estilziação para layout e design do aplicativo.
- **script.js**: Contém a lógica do frontend para interagir com o backend e renderizar dados.

---

## Technology Stack 🚀

- **Backend**: Flask (Python)
- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Database**: SQLite

---

## Dependências 📦

- [Flask](https://flask.palletsprojects.com/en/stable/quickstart/): Permite criar sites e APIs de maneira fácil e eficiente usando Python.
- [flask-cors](https://flask-cors.readthedocs.io/en/latest/index.html): Usa cabeçalhos HTTP para permitir que servidores autorizem o acesso a recursos de origens diferentes da sua

---

## Como usar 🛠️

1. Instale o Python e adicione ao PATH do sistema
2. Crie o Ambiente Virtual:
```
    python -m venv nome_do_ambiente
    .\nome_do_ambiente\Scripts\Activate.ps1
```

3. Instalar dependências:

```
    git clone `https://github.com/wilsondesouza/metricshub
    cd /metricshub
    pip3 install -r requirements.txt
```

4. Determinar fonte de Banco de Dados

- Editar `config.json` e passar o caminho dos databases a serem utilizados

5. Execute o aplicativo:

`python3 app.py`

5. Abra o aplicativo em um navegador da web.

`http://127.0.0.1:7050`