# Harmonix coletor

Robô que lê páginas públicas de agenda, pede à IA (Gemini, faixa gratuita) para extrair os eventos e coloca na sua
planilha como **pendentes**. Nada aparece no site até você escrever `sim` na coluna `aprovado`.

Como funciona: GitHub Actions (todo dia 06:00) -> lê as páginas de `fontes.json` (só as que o `robots.txt` permite)
-> Gemini extrai e cita o trecho da página que prova cada evento -> o robô descarta o que não bate com a página
-> Apps Script grava na aba `eventos` da planilha.

## Passo a passo

### 1. Chave gratuita do Gemini
1. Abra https://aistudio.google.com/apikey e entre com a conta Google.
2. **Create API key** e copie. Não cole essa chave em nenhum arquivo.

### 2. Receptor na planilha (Apps Script)
1. Abra a planilha do Harmonix (a aba `eventos`).
2. **Extensões > Apps Script**. Apague o que estiver lá e cole o conteúdo de `apps-script/Code.gs`.
3. Engrenagem **Configurações do projeto** > **Propriedades do script** > **Adicionar propriedade**: nome `TOKEN`, valor uma senha longa inventada por você (guarde, vai usar no passo 4).
4. **Implantar > Nova implantação** > tipo **App da Web**. Executar como: **Eu**. Quem tem acesso: **Qualquer pessoa**. Implantar e autorizar.
5. Copie o **URL do app da Web** (termina em `/exec`).

### 3. Repositório no GitHub
1. https://github.com/new, nome `harmonix-coletor`, **Public**, criar.
2. **uploading an existing file** e arraste TODO o conteúdo desta pasta (inclusive a pasta `.github`). Se a `.github` não subir pelo navegador, use o GitHub Desktop.
3. Commit.

### 4. Segredos
No repositório: **Settings > Secrets and variables > Actions > New repository secret**. Crie:
- `GEMINI_API_KEY`: a chave do passo 1
- `SHEET_WEBHOOK_URL`: o URL `/exec` do passo 2
- `SHEET_WEBHOOK_TOKEN`: o mesmo TOKEN do passo 2
- `EVENTS_CSV_URL` (opcional, evita repetir eventos): o link CSV publicado da aba `eventos`

### 5. Primeiro teste (sem enviar nada)
**Actions > Coletar eventos > Run workflow** com "Modo teste" marcado. Abra a execução: os testes do robô rodam e o log mostra,
fonte por fonte, quantos eventos a IA achou. O arquivo `resumo` (em Artifacts) traz as linhas candidatas.

### 6. Valendo
Rode de novo **desmarcando** o modo teste. As linhas entram na planilha com `aprovado` vazio e as colunas `fonte` e `coletado_em`.
Confira o evento no link da coluna `fonte` e escreva `sim` em `aprovado`. O site passa a mostrar.
Depois disso o robô roda sozinho todo dia.

## Cuidados
- Mantenha em `fontes.json` só páginas cujos termos de uso permitam a leitura automática.
- O GitHub pode desativar agendamentos de repositórios públicos sem atividade por muito tempo; se parar, reative em Actions.
- Gemini na faixa gratuita tem limite de uso e o Google pode usar o conteúdo enviado. O robô só envia texto de páginas públicas.
- Não crie fontes de Instagram/Facebook: exigem login e os termos proíbem a leitura automática.
