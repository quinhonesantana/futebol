# Sorteio da Pelada: como publicar no Netlify (com Firebase para os dados)

- **Netlify** hospeda o site. Ele é só a pasta `public/`.
- **Firebase** guarda os dados e faz o login anônimo:
  - **Firestore:** o banco de dados com jogadores, notas e sorteio.
  - **Login anônimo:** liga cada celular ou computador ao jogador que digitou o número. Não envia SMS.

Os dois serviços têm plano gratuito suficiente para a pelada, e você não precisa instalar nada no computador.

## Parte 1: Firebase (os dados)

### 1. Criar o projeto
1. Acesse https://console.firebase.google.com e clique em **Adicionar projeto**. O Google Analytics pode ficar desligado.
2. Na tela inicial do projeto, clique no ícone **</>** (Web) para registrar um app. Dê um apelido qualquer e **não** marque a opção de Firebase Hosting.
3. O Firebase mostra um bloco `const firebaseConfig = { ... }`. Copie esses valores para o arquivo **`public/firebase-config.js`**, trocando os textos de exemplo.

### 2. Ligar o login anônimo
**Authentication** → **Começar** → aba **Método de login** → **Anônimo** → **Ativar** → **Salvar**.

### 3. Criar o banco e colar as regras de segurança
1. **Firestore Database** → **Criar banco de dados** → escolha o modo **produção** e o local **southamerica-east1 (São Paulo)**.
2. Abra a aba **Regras**, apague o que estiver lá e cole todo o conteúdo do arquivo **`firestore.rules`**. Clique em **Publicar**.

### 4. Cadastrar você como organizador
No Firestore, aba **Dados**, clique em **Iniciar coleção**:
- **ID da coleção:** `admins`
- **ID do documento:** seu celular no formato `+55` + DDD + número, só com números. Exemplo: `+5511987654321`.
- **Campo:** `nome`, do tipo string, com o seu nome.

Para ter outro organizador, crie mais um documento em `admins` com o celular dele.

## Parte 2: Netlify (o site)

### 5. Publicar
O jeito mais simples:
1. Entre em https://app.netlify.com/drop (crie a conta grátis se pedir).
2. Arraste a pasta **`public`** (só ela) para a página.
3. Em segundos aparece o endereço do site, algo como `https://nome-aleatorio.netlify.app`. Em **Site configuration → Change site name** você troca para algo como `sorteio-da-pelada`.

Outro jeito: se colocar este projeto num repositório do GitHub e conectar ao Netlify, o arquivo `netlify.toml` já diz para publicar a pasta `public`. Assim, cada alteração enviada ao GitHub publica sozinha.

### 6. Autorizar o endereço no Firebase
Firebase → **Authentication** → **Configurações** → **Domínios autorizados** → **Adicionar domínio** → cole o endereço do Netlify sem `https://`. Exemplo: `sorteio-da-pelada.netlify.app`.

## Parte 3: Primeiro acesso
1. Abra o endereço do Netlify e digite **o celular que você colocou em `admins`**.
2. O app pede seu nome e sua posição. Você entra direto na aba **Grupo**.
3. Cadastre os jogadores com nome, celular e posição.
4. Mande o link no grupo do WhatsApp. Cada um entra digitando o próprio celular.

## Atualizar o app depois
- **Publicou arrastando a pasta:** no Netlify, abra o site → **Deploys** → arraste a pasta `public` atualizada.
- **Usa GitHub:** é só enviar as alterações.

Os dados ficam no Firebase e não são apagados quando você republica o site.

## Se algo der errado
- **"Falta configurar":** o `public/firebase-config.js` ainda está com os textos de exemplo.
- **"Ative o login Anônimo":** falta o passo 2.
- **"O Firebase recusou o acesso":** as regras do passo 3 não foram publicadas.
- **"Esse número não está no grupo" com o seu próprio número:** confira o ID do documento em `admins`. Precisa estar exatamente como `+55` + DDD + número, sem espaços.

## Sobre segurança
- O login é só pelo número, sem SMS. Quem souber o celular de um jogador consegue entrar como ele. Isso inclui o organizador: quem souber o seu número entra com os seus poderes.
- Os celulares só aparecem para organizadores. Os jogadores só conseguem gravar as próprias notas.
