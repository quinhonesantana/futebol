# Peixe Futebol Clube

<img src="public/logo.jpg" alt="Escudo do Peixe Futebol Clube" width="160">


App web para o futebol semanal do grupo:
- **Avaliação:** cada jogador avalia todo o grupo em cinco atributos (Defesa, Passe, Ataque, Resistência e Velocidade, de 1 a 5) e, se quiser, vota na posição secundária ideal de cada um (opcional).
- **Jogadores:** as médias de todas as avaliações viram o perfil de cada jogador.
- **Sorteio:** o app monta times equilibrados por posição (zagueiro, meio, atacante) e por nota. Você define quantos times e quantos titulares por time, e quem sobra fica de reserva. Também dá para incluir convidados.

**Tecnologias:** HTML, CSS e JavaScript puros, sem etapa de build. O site é hospedado no Netlify; os dados ficam no Firebase (Firestore e login anônimo pelo celular).

## Estrutura

| Caminho | O que é |
|---|---|
| `public/index.html` | Telas e estilos |
| `public/app.js` | Lógica do app: login, avaliação, perfis, sorteio, grupo |
| `public/firebase-config.js` | Dados do projeto Firebase (preencher) |
| `firestore.rules` | Regras de segurança do banco |
| `netlify.toml` | Diz ao Netlify para publicar a pasta `public` |

## Como publicar (Netlify + Firebase)

- **Netlify** hospeda o site. Ele é só a pasta `public/`.
- **Firebase** guarda os dados e faz o login anônimo:
  - **Firestore:** o banco de dados com jogadores, notas e sorteio.
  - **Login anônimo:** liga cada celular ou computador ao jogador que digitou o número. Não envia SMS.

Os dois serviços têm plano gratuito suficiente para a pelada, e você não precisa instalar nada no computador.

### Parte 1: Firebase (os dados)

#### 1. Criar o projeto
1. Acesse https://console.firebase.google.com e clique em **Adicionar projeto**. O Google Analytics pode ficar desligado.
2. Na tela inicial do projeto, clique no ícone **</>** (Web) para registrar um app. Dê um apelido qualquer e **não** marque a opção de Firebase Hosting.
3. O Firebase mostra um bloco `const firebaseConfig = { ... }`. Copie esses valores para o arquivo **`public/firebase-config.js`**, trocando os textos de exemplo.

#### 2. Ligar o login anônimo
**Authentication** → **Começar** → aba **Método de login** → **Anônimo** → **Ativar** → **Salvar**.

#### 3. Criar o banco e colar as regras de segurança
1. **Firestore Database** → **Criar banco de dados** → escolha o modo **produção** e o local **southamerica-east1 (São Paulo)**.
2. Abra a aba **Regras**, apague o que estiver lá e cole todo o conteúdo do arquivo **`firestore.rules`**. Clique em **Publicar**.

#### 4. Cadastrar você como organizador
No Firestore, aba **Dados**, clique em **Iniciar coleção**:
- **ID da coleção:** `admins`
- **ID do documento:** seu celular no formato `+55` + DDD + número, só com números. Exemplo: `+5511987654321`.
- **Campo:** `nome`, do tipo string, com o seu nome.

Os outros organizadores você define pelo próprio app: na aba **Grupo**, use **Tornar organizador** ao lado do jogador.

### Parte 2: Netlify (o site)

#### 5. Publicar
O jeito mais simples:
1. Entre em https://app.netlify.com/drop (crie a conta grátis se pedir).
2. Arraste a pasta **`public`** (só ela) para a página.
3. Em segundos aparece o endereço do site, algo como `https://nome-aleatorio.netlify.app`. Em **Site configuration → Change site name** você troca para algo como `sorteio-da-pelada`.

Outro jeito: se colocar este projeto num repositório do GitHub e conectar ao Netlify, o arquivo `netlify.toml` já diz para publicar a pasta `public`. Assim, cada alteração enviada ao GitHub publica sozinha.

#### 6. Autorizar o endereço no Firebase
Firebase → **Authentication** → **Configurações** → **Domínios autorizados** → **Adicionar domínio** → cole o endereço do Netlify sem `https://`. Exemplo: `sorteio-da-pelada.netlify.app`.

### Parte 3: Primeiro acesso
1. Abra o endereço do Netlify e digite **o celular que você colocou em `admins`**.
2. O app pede seu nome e sua posição. Você entra direto na aba **Grupo**.
3. Cadastre os jogadores com nome, celular e posição.
4. Mande o link no grupo do WhatsApp. Cada um entra digitando o próprio celular.

## Perfis de acesso

| | Organizador | Jogador |
|---|---|---|
| Avaliar e ver perfis | Sim | Sim (depois de avaliar todo o grupo) |
| Sortear e publicar os times | Sim | Não: só vê o sorteio publicado |
| Partida ao vivo: escolher quem começa, começar, marcar gols e encerrar | Sim | Sim |
| Desfazer gol na partida ao vivo | Qualquer gol | Só os que ele marcou |
| Lançar à mão e apagar resultados | Sim | Não: vê jogos, artilharia e desempenho |
| Cadastrar, importar e remover jogadores | Sim | Não |
| Ver celulares | Sim | Não |
| Tornar ou tirar organizador | Sim (menos a si mesmo) | Não |
| Resetar as notas de todo o grupo | Sim (Grupo → Resetar todas as notas) | Não |

**Visitantes** (quem abre o link sem entrar) veem, na tela inicial, as abas Jogadores (perfis com as médias) e Resultados. Eles não veem o sorteio, os celulares nem quem deu qual nota. O resumo dos perfis é atualizado sozinho sempre que um organizador está com o app aberto.

O sorteio feito por um organizador fica só na tela dele, como prévia, até ele tocar em **Publicar sorteio**.

## Partida ao vivo
A aba **Ao vivo** abre toda **segunda-feira às 19:30**, desde que o sorteio esteja publicado, e fica aberta até 30 minutos depois da 1h30 de pelada. Fora desse horário ela mostra a contagem regressiva e os times sorteados. Um organizador pode abri-la antes, por 3 horas, com **Abrir agora**.

- **3 times:** jogos de 7 minutos. Antes do 1º jogo, escolhe-se quem começa. No 1º jogo o perdedor sai (no empate, escolhe-se quem sai). Depois, sai sempre quem jogou 2 seguidas.
- **2 times:** um jogo só, direto até o fim da 1h30. Substituições não são marcadas.
- Qualquer jogador ou organizador começa, marca gols (com assistência e gol contra) e encerra. Cada ação mostra quem fez.
- Ao encerrar, o jogo vai sozinho para a aba **Resultados**. Se o primeiro jogo do mês for encerrado, as notas travam.
- Tudo é compartilhado em tempo real entre os celulares. Dois toques em "Encerrar" ao mesmo tempo não duplicam o jogo.

## Quando as notas travam
- **Até a primeira partida do mês:** cada jogador pode mudar as próprias notas à vontade. As notas só são gravadas quando ele toca em **Salvar notas**, no fim da página. No primeiro acesso, cada jogador é salvo ao tocar em **Próximo**.
- **No primeiro jogo do mês:** quando um organizador lança esse jogo na aba Resultados, as notas que já foram dadas travam. Notas de jogadores que a pessoa ainda não avaliou continuam liberadas, para quem entrou depois.
- **Revisão:** o presidente (organizador) libera as notas em **Grupo → Abrir revisão de notas**. Elas voltam a travar no primeiro jogo do mês seguinte, ou antes, se ele tocar em **Travar notas agora**.

## Importar um cadastro
Na aba **Grupo**, um organizador logado abre **Importar cadastro**, escolhe o arquivo `.json` e clica em **Importar**:
- Entram os jogadores, com nome, posição e celular.
- Quem já tem o mesmo celular no grupo é mantido como está, sem duplicar. Por isso dá para importar de novo sem medo.
- As notas importadas são só as de quem está logado. As outras pessoas precisam entrar e avaliar.

O arquivo tem os celulares do grupo. Não coloque esse arquivo no GitHub.

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
