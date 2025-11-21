# NBA — Narrativa Visual Replicável

Sistema completo para carregar dados originais do NBA no **DuckDB** e construir visualizações **D3.js**:
- Variação temporal (distribuição de jogos por temporada)
- Análise de equipes (top times por pontos, estatísticas comparativas)
- Correlações entre variáveis (pontos vs assistências)
- Evolução de pontos por quarto ao longo dos anos
- Eficiência de arremessos (FG%, 3P%, FT%)
- Auditoria de qualidade + decisões de pré-processamento

## 🚀 Início Rápido

```bash
# 1. Navegue até a pasta do projeto
cd NBA

# 2. Instale as dependências
npm install

# 3. Baixe os dados (veja seção "📥 Download de Dados" abaixo)

# 4. Execute a aplicação
npm run dev

# 5. Acesse http://localhost:3000 e clique em "Ingerir/Atualizar banco"
```

## 📁 Estrutura de Pastas

```
NBA/
├─ data/              # Dados CSV do NBA (baixados do Kaggle)
├─ public/
│  ├─ index.html      # Interface principal
│  ├─ style.css       # Estilos
│  └─ app.js          # Visualizações D3.js
├─ src/
│  └─ db.js           # Configuração DuckDB
├─ server.js          # Servidor Express + endpoints
├─ download-nba-data.py  # Script de download
├─ package.json
├─ nba.duckdb         # Banco criado automaticamente
└─ README.md
```

## 📥 Download de Dados

### Download Manual

O script `download-nba-data.py` verifica se os arquivos CSV já foram baixados manualmente.

**Passo a passo:**

1. **Acesse o dataset no Kaggle:**
   - URL: https://www.kaggle.com/datasets/wyattowalsh/basketball
   - Você precisa estar logado no Kaggle (crie uma conta gratuita se necessário)

2. **Baixe o dataset:**
   - Clique no botão **"Download"** (canto superior direito)
   - O arquivo será baixado como um ZIP

3. **Extraia o arquivo:**
   - Descompacte o arquivo ZIP baixado
   - Você verá vários arquivos CSV dentro

4. **Copie os arquivos para a pasta do projeto:**
   ```bash
   # Copie todos os arquivos CSV para:
   NBA/data/
   ```

5. **Verifique se os arquivos estão corretos:**
   ```bash
   python3 download-nba-data.py
   ```
   O script irá verificar e listar os arquivos encontrados.

### Estrutura Esperada

Após o download, a pasta `data/` deve conter arquivos CSV como:
- `game.csv` ou `game_summary.csv` (dados principais dos jogos)
- `line_score.csv` (pontuação por quarto e estatísticas de times)
- `player.csv` (dados de jogadores)
- E outros arquivos CSV relacionados ao NBA

### Verificação

Execute o script para verificar os arquivos:
```bash
python3 download-nba-data.py
```

Se os arquivos estiverem corretos, você verá:
```
✅ Encontrados X arquivo(s) CSV existente(s):
   ✓ arquivo1.csv (X.XX MB)
   ✓ arquivo2.csv (X.XX MB)
```

## 🖥️ Executando a Aplicação

### Pré-requisitos
- **Node.js 18+** e npm
- **Python 3.6+** (opcional, apenas para verificar arquivos baixados)
- **Dados do NBA** em formato CSV na pasta `data/`

### Passo a Passo

1. **Instale as dependências:**
   ```bash
   npm install
   ```

2. **Baixe os dados:**
   - Veja a seção **"📥 Download de Dados"** acima para instruções detalhadas

3. **Execute a aplicação:**
   ```bash
   npm run dev
   ```

4. **Acesse no navegador:**
   ```
   http://localhost:3000
   ```

5. **Carregue os dados no banco:**
   - Clique em **"Ingerir/Atualizar banco"** na interface
   - Aguarde o processamento
   - Os dados serão carregados no DuckDB automaticamente

## 🗄️ Banco de Dados (DuckDB)

O sistema usa **DuckDB** para processar os dados:
- ✅ **Não requer instalação** de banco de dados
- ✅ **Processamento in-memory** otimizado
- ✅ **Leitura direta** dos arquivos CSV
- ✅ **Criação automática** das tabelas/views
- ✅ **Filtros de qualidade** aplicados automaticamente

**Arquivo do banco:** `nba.duckdb` (criado automaticamente)

## 📊 Visualizações Disponíveis

O sistema oferece 7 visualizações interativas:

### 🏀 **Análise Temporal**
- **Distribuição de Jogos por Temporada**: Número de jogos únicos por ano (gráfico de barras)

### 🏆 **Análise de Equipes**
- **Top Times por Pontos Totais**: Ranking dos 10 times com maior total de pontos (gráfico de barras horizontais)
- **Estatísticas por Equipe**: Comparação de equipes por total de pontos, média por jogo e número de jogos (gráfico de barras horizontais)

### 📈 **Análise de Correlação**
- **Pontos vs Assistências**: Gráfico de dispersão explorando a relação entre pontos marcados e assistências

### ⏱️ **Evolução Temporal**
- **Evolução de Pontos por Quarto ao Longo dos Anos**: Média de pontos marcados por quarto nos últimos 5 anos (gráfico de linhas)

### 🎯 **Eficiência de Arremessos**
- **Eficiência de Arremessos**: Comparação da eficiência de arremessos entre times (FG%, 3P%, FT%) (gráfico de barras agrupadas)

### 🔍 **Qualidade dos Dados**
- **Diagnósticos**: Auditoria de dados com identificação de valores inválidos, dados faltantes e estatísticas gerais

## 🔧 Adaptação para Diferentes Estruturas de Dados

O sistema foi projetado para ser flexível e detectar automaticamente a estrutura dos dados. Se o dataset tiver colunas diferentes, o sistema tentará mapear automaticamente:

- **Pontos**: `points`, `pts`, `PTS`
- **Assistências**: `assists`, `ast`, `AST`
- **Rebotes**: `rebounds`, `reb`, `REB`
- **Jogador**: `player`, `player_name`, `name`
- **Equipe**: `team`, `team_name`
- **Data**: `date`, `game_date`
- **Temporada**: `season`, `year`

## 🛠️ Solução de Problemas

### ❌ **Erro: "Nenhum arquivo CSV encontrado"**
- **Solução:** Baixe os dados manualmente do Kaggle (veja seção "📥 Download de Dados")
- Verifique se os arquivos estão na pasta `NBA/data/`
- Certifique-se de que os arquivos têm extensão `.csv` ou `.CSV`
- Execute `python3 download-nba-data.py` para verificar

### ❌ **Erro: "Tabela não encontrada"**
```bash
# Solução: Execute o servidor e clique em "Ingerir/Atualizar banco"
npm run dev
```

### ❌ **Erro: "Porta 3000 em uso"**
```bash
# Solução: Pare o processo anterior
pkill -f "node server.js"
# Ou use outra porta: PORT=3001 npm run dev
```

### ❌ **Erro: "Arquivo muito pequeno"**
- O arquivo pode estar corrompido ou vazio
- Baixe novamente do Kaggle

### ❌ **Erro: "Erro ao ler arquivo"**
- Verifique se o arquivo não está corrompido
- Tente baixar novamente do Kaggle

## 📝 Notas sobre o Dataset

O dataset do NBA pode ter diferentes estruturas dependendo da fonte. Este sistema foi projetado para:
- Detectar automaticamente a estrutura dos dados
- Mapear colunas comuns (pontos, assistências, etc.)
- Funcionar com diferentes formatos de data
- Adaptar-se a diferentes nomenclaturas de colunas

Se encontrar problemas com a estrutura específica do seu dataset, você pode:
1. Verificar os logs do servidor para identificar erros de leitura
2. Ajustar as queries SQL no `server.js`
3. Adaptar as visualizações no `app.js`

## 🎯 Objetivos do Projeto

Este projeto foi desenvolvido para:
- ✅ Carregar dados originais diretamente no DuckDB (sem pré-processamento externo)
- ✅ Criar visualizações interativas com D3.js
- ✅ Explorar variações temporais relevantes
- ✅ Analisar composição de variáveis de interesse
- ✅ Realizar auditoria de qualidade de dados
- ✅ Documentar decisões de pré-processamento

## 📚 Tecnologias Utilizadas

- **Backend**: Node.js + Express
- **Banco de Dados**: DuckDB
- **Visualizações**: D3.js v7
- **Frontend**: HTML5 + CSS3 + JavaScript ES6+

## 📄 Licença

Este projeto é um trabalho acadêmico desenvolvido para análise exploratória de dados.

---

**Desenvolvido para análise de dados do NBA com foco em narrativa visual replicável.**

