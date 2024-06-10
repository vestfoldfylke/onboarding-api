# onboarding-api
API for å onboarde folk, verifisere bruker, og resette passord for brukere

## Løsningsbeskrivelse
Løsningen er satt opp som en SPA med BFF for autentisering/autorisering

[SPA / Frontend finnes her](https://github.com/vestfoldfylke/onboarding-web), dette repoet er BFF-en (backend-for-frontend)
[SPA / Frontend finnes her](https://github.com/telemarkfylke/onboarding-web), dette repoet er BFF-en (backend-for-frontend)

Løsningen er ment å dekke behovet for onboarding, verifisering og passordbytte for ansatte og elever i fylkeskommunen, og baserer seg på self-service av disse tjenestene bak ID-Porten.

- Brukere loses til https:/{ditt-domene}, evt https:/{ditt-domene}/ansatt eller https:/{ditt-domene}/elev
- Nye brukere klikker "Tilbakestill passord", sendes til ID-porten for pålogging, deretter hentes EntraID-brukeren basert på fnr fra ID-porten, passord tilbakestilles og sendes til brukeren på SMS. Brukeren loses så til tvunget passordbytte i EntraID, og deretter til MFA-oppsett. Etter dette er de ferdige.
  - Brukere som har glemt passordet sitt kan følge den samme prosessen. Om de allerede har MFA, kreves ikke oppsett av dette i siste steg.
- Brukere som skal verifisere seg, klikker "Verifiser bruker", sendes til ID-porten for pålogging, deretter hentes EntraID-brukeren basert på fnr fra ID-porten. Brukeren loses så til EntraID-pålogging og MFA-oppsett dersom dette ikke er satt opp allerede.
- ID-porten pålogginger / forsøk lagres i database, videre steg (EntraID) knyttes til den samme oppføringen i databasen for logging.

## Setup
### ID-Porten
Det må [settes opp en ID-porten klient](https://docs.digdir.no/docs/idporten/)
- Tillatte grant types
  - authorization_code
- Klientautentiseringsmetode
  - client_secret_post
- Applikasjonstype
  - web
- Gyldige redirect-uri-er
  - https://{ditt-domene}/idportencallback
- Gyldig(e) post logout redirect uri-er
  - https://{ditt-domene}
- Frontchannel logout uri
  - https://{ditt-domene}
- Tilbake-uri
  - https://{ditt-domene}
- sso_disabled = true
- PKCE (code_challenge_method)
  - S256
Opprett klienten/integrasjonen - ta vare på client-id og client-secret

### EntraID passordbytte app registration
Det må settes opp en app registration + enterprise application i EntraID (Azure) som brukere vil bli redirected/login til etter api/ResetPassword
- API permissions
  - User.Read (delegated)
- Redirect URIs
  - https:/{ditt-domene}/entrapwdcallback (web)
Ellers styres denne med de policyene og brukerne du selv ønsker (hvem kan logge på, CA-policy osv)

### EntraID statistics app registration
Det må settes opp en app registration + enterprise application i EntraID (Azure) som brukere vil bli redirected/login til etter innlogging
- API permissions
  - User.Read (delegated)
- Redirect URIs
  - https:/{ditt-domene}/entrapwdcallback (web)
Ellers styres denne med de policyene og brukerne du selv ønsker (hvem kan logge på, CA-policy osv)


**MERK** Vi bruker to app-registrations for å få mer brukervennlig rekkefølge for passordbytte. Først passordbytte -> mfa

### EntraID verifiy / mfa app registration
Det må settes opp en app registration + enterprise application i EntraID (Azure) som brukere vil bli redirected/login til etter api/VerifyUser, og evt etter fullført passordbytte.
- API permissions
  - User.Read (delegated)
- Redirect URIs
  - https:/{ditt-domene}/entramfacallback (web)
- App roles
  - Vanlig.Bruker (ansatte og elever)
Ellers styres denne med de policyene og brukerne du selv ønsker (hvem kan logge på, CA-policy osv)

### Stats app registration
Det må settes opp en app registration + enterprise application i EntraID (Azure) som brukere vil bli redirected til etter innlogging.
- API permissions
  - User.Read (delegated)
- Redirect URIs
  - https:/{ditt-domene}/entramfacallback (web) 
- App roles
  - Stats.Read (brukere som skal kunne hente statistikk fra løsningen, hvor mange som er onboardet via løsningen osv)
Ellers styres denne med de policyene og brukerne du selv ønsker (hvem kan logge på, CA-policy osv)

### EntraID onboarding-api app registration + service-bruker for passordbytte
Det må settes opp en app registration + enterprise application i EntraID (Azure) som representerer dette api-et (for Graph-kall)
- API permissions
  - CustomSecAttributeAssignment.Read.All (leser fnr for elever) (Application)
  - User.Read.All (leser fnr for ansatte) (Application)
  - UserAuthenticationMethod.Read.All (sjekker mfa og passord) (Application)
  - UserAuthenticationMethod.ReadWrite.All (Delegated)

Det må settes opp en service-bruker med "Assigned role"="Authentication administrator", denne må også ha tilgang på EntraID onboarding-api enterprise-application
- ResetPassword i graph støtter ikke application permission, og PATCH authenticationMethods/passwordProfile støtter ikke AD-writeback... Derav servicebruker for ResetPassword i Microsoft Graph 

### MongoDB
Det må settes opp en mongoDB-database, med collection "user-log"

### Azure function
Det må settes opp en Azure function resource i Azure. Kjør på en App service plan som tåler antall brukere du forventer.
- Function runtime version: ~4
- Nodejs version: 20 LTS
- HTTPS only: true
- Mimimum TLS: 1.2
- Always on: true
#### Environment variables
```json
{
  "APPREG_TENANT_ID": "home tenant id",
  "APPREG_CLIENT_ID": "client id for the onboarding-api app registration",
  "APPREG_CLIENT_SECRET": "client secret for the onboarding-api app registration",
  "AUTHENTICATION_ADMINISTRATOR_SCOPE": "UserAuthenticationMethod.ReadWrite.All",
  "AUTHENTICATION_ADMINISTRATOR_USERNAME": "Service bruker userPrincipalName",
  "AUTHENTICATION_ADMINISTRATOR_PASSWORD": "Service bruker password",
  "IDPORTEN_CLIENT_ID": "idporten-client-id",
  "IDPORTEN_CLIENT_SECRET": "idporten-client-id",
  "IDPORTEN_WELL_KNOWN_ENDPOINT": "id porten well-known endpoint",
  "IDPORTEN_CLIENT_REDIRECT_URI": "https:/{ditt-domene}/idportencallback",
  "IDPORTEN_CLIENT_POST_LOGOUT_REDIRECT_URI": "https:/{ditt-domene}",
  "ENTRA_PWD_CLIENT_ID": "client id for the password app registration",
  "ENTRA_PWD_CLIENT_SECRET": "client secret for the password app registration",
  "ENTRA_PWD_TENANT_ID": "home tenant id",
  "ENTRA_PWD_CLIENT_REDIRECT_URI": "https:/{ditt-domene}/entrapwdcallback",
  "ENTRA_PWD_CLIENT_POST_LOGOUT_REDIRECT_URI": "https:/{ditt-domene}",
  "ENTRA_MFA_CLIENT_ID": "client id for the mfa/verify app registration",
  "ENTRA_MFA_CLIENT_SECRET": "client secret for the mfa/verify app registration",
  "ENTRA_MFA_TENANT_ID": "home tenant id",
  "ENTRA_MFA_CLIENT_REDIRECT_URI": "https:/{ditt-domene}/entramfacallback",
  "ENTRA_MFA_CLIENT_POST_LOGOUT_REDIRECT_URI": "https:/{ditt-domene}",
  "ENTRA_STATISTICS_CLIENT_ID": "client id for the mfa/verify/statistics app registration",
  "ENTRA_STATISTICS_CLIENT_SECRET": "client secret for the mfa/verify/statistics app registration",
  "ENTRA_STATISTICS_TENANT_ID": "home tenant id",
  "ENTRA_STATISTICS_CLIENT_REDIRECT_URI": "https:/{ditt-domene}/entramfacallback",
  "ENTRA_STATISTICS_CLIENT_POST_LOGOUT_REDIRECT_URI": "https:/{ditt-domene}",
  "GRAPH_SSN_EXTENSION_ATTRIBUTE": "name of extension attribute for employee ssn",
  "GRAPH_EMPLOYEE_UPN_SUFFIX": "employee upn suffix (including '@')",
  "GRAPH_STUDENT_UPN_SUFFIX": "student upn suffix (including '@')",
  "DEMO_MODE_ENABLED": "true/false - if demo mode is enabled",
  "DEMO_MODE_GLOBAL_MOCK_RESET_PASSWORD": "true/false - if true, password is not reset, mock-password is sent to user", // Requires DEMO_MODE_ENABLED="true"
  "DEMO_MODE_DEMO_USERS": "{\"id-porten ssn that triggers override\":{\"DEMO_SSN\":\"ssn that is used for lookup in graph\",\"DEMO_UPN\":\"overrides upn found in graph\",\"DEMO_PHONE_NUMBER\":\"overrides phonenumber found in KRR\",\"MOCK_RESET_PASSWORD\":\"true/false\"}}", // Requires DEMO_MODE_ENABLED="true"
  "KRR_URL": "your krr-api url",
  "KRR_KEY": "your krr-api key",
  "SMS_URL": "your sms-api url",
  "SMS_KEY": "your sms-api key",
  "SMS_SENDER": "Avsender på sms",
  "MONGODB_CONNECTION_STRING": "mongodb+srv://{db-user}:{db-user-password}@{clusteraddress}/?retryWrites=true&w=majority",
  "MONGODB_LOG_COLLECTION": "name of user log collection",
  "MONGODB_USERS_COLLECTION": "name of users collection",
  "MONGODB_DB_NAME": "db name",
  "STATISTICS_URL": "your statistics-api url",
  "STATISTICS_KEY": "your statistics-api key",
  "BAD_WORDS": "fuck,knull,...,pule", // Words that are NOT allowed in password generation, new word is generated if a word contains one of the words in the list. Comma-separated, no whitespace
  "EXCLUDED_COMPANIES":"skien,re,skogmo,horten,...." // CompanyNames that you want exluded for the graph and table. Comma-separeted, no whitespace
}
```

#### Deployment
Deploy denne koden til Azure function med ønsket måte (github actions, devops pipelines, azure-cli, sftp, osv)

## "Kort" ID-porten OIDC beskrivelse med BFF (backend for frontend)
- BFF generer en loginUrl for idporten
  - Henter nødvendige oidc-data fra ID-porten sitt well-known endepunkt
  - Setter redirect_uri fra BFF env
  - Oppretter en state (f. eks random guid)
  - Oppretter PKCE-codes med code_challenge_method (S256)
    - code_verifier
    - code_challenge (genereres ved å kjøre code_verifier gjennom code_challenge_method)
  - Genererer nonce (number used once)
  - state, code_verifier, og nonce caches i BFF
  - loginUrl som returneres innholder state, code_challenge, code_challenge, redirect_uri, client_id, nonce, prompt (om tvunget pålogging f. eks), og acr_values (hvilket sikkerhetsnivå kreves)
  - loginUrl returneres til bruker/browser
- Browser redirectes til mottatt loginUrl
  - Bruker logger inn i ID-porten
  - ID-porten redirecter tilbake til angitt redirect_uri sammen med state (samme som ble generert i loginUrl), code (auth_code), og iss (utsteder)
- Browser tar i mot redirect fra ID-porten, plukker med seg state, code, og iss fra url (queryparams), og sender disse over til BFF igjen
- BFF tar i mot state, code, og iss
  - Verifiserer først at de er der, og at de er rett type
  - State styrer vi selv, så den kan f. eks si hvilken route man logget inn fra ellerno, styres utifra behov
  - BFF slår opp code_verifier for den aktuelle innloggingen (som vi cachet i første steg, code_verifier har aldri nådd browser, kun levd i cache hos BFF)
  - BFF sender så inn code (denne kommer fra ID-porten-påloggingen til brukeren), state, iss, redirect_uri til token-endepunktet til ID-Porte
    - ID-porten verifiserer code, redirect_uri, og sjekker at code_challenge_method(code_verifier) blir til tilhørende code_challenge vi genererte opp i første steg, for å sikre at det var vår server som genererte både loginUrl, og ber om token
  - BFF får tilbake tokens (om alt er bra) - og BFF verifiserer så at nonce i ID-token er det samme som tilhørte loginUrl vi genererte for brukeren, slik at vi kan anta at det er samme bruker som ba om loginUrl
  - Om "Noen" får tak i redirect parameterne "code, iss, og state" før brukeren / browseren rekker å sende inn disse til BFF, kan de hijacke påloggingen, men de får ikke brukt de til noe annet enn å påkalle BFF-en, pga PKCE. BFF-en kan evt validere at code, iss, og state kommer fra samme bruker som fikk login-url, dersom dette er nødvendig.
  - BFF må håndtere sessions i tillegg til ID-porten sine sessions, dersom det trengs egne sessions. I denne løsningen skal det bare gjøres EN ting samtidig som ID-porten tokens hentes, og det er ikke behov for egen session. ID-porten pålogging tvinges ved hver handling som krever id-porten verifisering.

## API-endepunkter
For teknisk dokumentasjon, kikk på koden da...

### /IdPortenLoginUrl
- Genererer en login-url for id-porten og returnerer denne
  - Krever query-param user_type for å skille ansatte og elever
  - Krever query-param action for å skille "resetpassword" og "verifyuser"
  - prompt: "login", brukere tvinges til å aktivt logges på

### /IdPortenLogoutUrl
- Genererer en logout-url for id-porten og returnerer denne

### /ResetPassword
- Tar i mot state, iss, og code fra en fullført ID-porten pålogging i brukers browser
- Oppretter db-oppføring for requesten
- Logger inn bruker i ID-porten (henter id-token)
- Henter bruker fra EntraID basert på pid fra ID-porten-innlogging
- Henter mobilnummer for bruker fra KRR
- Resetter passordet for EntraID-bruker, med et tilfeldig generert passord som nytt passord
- Sender generert passord på SMS til mobilnummer fra KRR
- Lagrer data i db-oppføring
- Returnerer EntraID-navn, EntraID-brukernavn, sensurert mobilnummer, samt id for db-oppføring

### /VerifyUser
- Tar i mot state, iss, og code fra en fullført ID-porten pålogging i brukers browser
- Oppretter db-oppføring for requesten
- Logger inn bruker i ID-porten (henter id-token)
- Henter bruker fra EntraID basert på pid fra ID-porten-innlogging
- Lagrer data i db-oppføring
- Returnerer EntraID-navn, EntraID-brukernavn, samt id for db-oppføring

### /EntraPwdLoginUrl
- Genrerer en login-url for EntraID passordbytte enterprise application, og returnerer denne
  - Kan slenge med param login_hint for, ja, login_hint

### /EntraPwdAuth
- Tar i mot state (db-oppføring-id) og code fra en fullført EntraID passordbytte enterprise application pålogging i brukers browser
- Logger inn bruker i EntraID (henter id-token)
- Henter db-oppføring ved hjelp av state
- Sjekker at EntraID-brukeren er den samme som startet pålogging med ID-porten
- Oppdaterer db-oppføring
- Returnerer EntraID-navn, EntraID-brukernavn, og id for db-oppføring

### /EntraMfaLoginUrl
- Genrerer en login-url for EntraID mfa/verify enterprise application, og returnerer denne
  - Om query param action er tilstede, genereres loginUrl sin state basert på denne (brukes for admin/statistikk greier), om ikke genereres en loginurl for vanlige brukere

### /EntraMfaAuth
- Tar i mot state (db-oppføring-id) og code fra en fullført EntraID passordbytte enterprise application pålogging i brukers browser
- Logger inn bruker i EntraID (henter id-token)
- Henter db-oppføring ved hjelp av state
- Sjekker at EntraID-brukeren er den samme som startet pålogging med ID-porten
- Oppdaterer db-oppføring - med fullført, timestamp osv
- Returnerer EntraID-navn, EntraID-brukernavn, og id for db-oppføring

### /UserStats
- Tar i mot state og code fra en fullført EntraID passordbytte enterprise application pålogging i brukers browser
- Logger inn bruker i EntraID (henter id-token)
- Sjekker at Stats.Role rolle er på plass
- Henter statistikk for løsningen
- Returnerer statistikken

### UpdateUserCollection (Timer Trigger)
- Henter alle ansatte og elever
- Oppdaterer / oppretter en oppføring i users-collection per ansatt elev

### CheckNewLogEntries (Timer Trigger)
- Går gjennom alle nye user-log-entries i db
- Henter det nyeste av user-log-entries for en bruker, og knytter det mot brukeren i users-collection i latestLogEntry-property
  - Om brukeren for log-entryen ikke eksisterer i users-collection, opprettes den i users-collection først


## DEMO_MODE_DEMO_USERS_GENERATOR
For enklere oppretting av DEMO_MODE_DEMO_USERS regler

```js
const mockRules = {
  "12345678910": { // Who should the demo-rules trigger on (idporten ssn)
    DEMO_SSN: '12345678910', // Optional - else uses pid from idporten
    DEMO_UPN: 'demomann@demo.no', // Optional - else uses upn connected to ssn
    DEMO_PHONE_NUMBER: '+4712345678', // Optional - else uses phonenumber from krr connected to 
    MOCK_RESET_PASSWORD: 'true' // Optional - else actually resets password
  },
  '12345678911': { // Add as many as you like
    DEMO_SSN: '12345678912',
    DEMO_UPN: 'jorthe@gothtr.no',
    DEMO_PHONE_NUMBER: '+4787654321',
    MOCK_RESET_PASSWORD: 'false'
  }
}

const escaped = JSON.stringify(JSON.stringify(mockRules))

console.log(escaped)

// Add rule to DEMO_MODE_DEMO_USERS env variable, and set DEMO_MODE_ENABLED to "true" in env variables
```

## Local development
- Klon ned røkla, eller fork og klon
- Pass på å ha installert azure function core tools
- `npm i`
- Fyll inn en hel haug med stæsj i ./local.settings.json:
```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureWebJobsFeatureFlags": "EnableWorkerIndexing",
    "AzureWebJobsStorage": "",
    "APPREG_TENANT_ID": "",
    "APPREG_CLIENT_ID": "",
    "APPREG_CLIENT_SECRET": "",
    "AUTHENTICATION_ADMINISTRATOR_SCOPE": "UserAuthenticationMethod.ReadWrite.All",
    "AUTHENTICATION_ADMINISTRATOR_USERNAME": "",
    "AUTHENTICATION_ADMINISTRATOR_PASSWORD": "",
    "IDPORTEN_CLIENT_ID": "",
    "IDPORTEN_CLIENT_SECRET": "",
    "IDPORTEN_WELL_KNOWN_ENDPOINT": "https://test.idporten.no/.well-known/openid-configuration",
    "IDPORTEN_CLIENT_REDIRECT_URI": "http://localhost:5173/idportencallback",
    "IDPORTEN_CLIENT_POST_LOGOUT_REDIRECT_URI": "http://localhost:5173",
    "ENTRA_PWD_CLIENT_ID": "",
    "ENTRA_PWD_CLIENT_SECRET": "",
    "ENTRA_PWD_TENANT_ID": "",
    "ENTRA_PWD_CLIENT_REDIRECT_URI": "",
    "ENTRA_MFA_CLIENT_ID": "",
    "ENTRA_MFA_CLIENT_SECRET": "",
    "ENTRA_MFA_TENANT_ID": "",
    "ENTRA_MFA_CLIENT_REDIRECT_URI": "http://localhost:5173/entramfacallback",
    "GRAPH_SSN_EXTENSION_ATTRIBUTE": "",
    "GRAPH_EMPLOYEE_UPN_SUFFIX": "@domain.com",
    "GRAPH_STUDENT_UPN_SUFFIX": "@school.domain.com",
    "DEMO_MODE_ENABLED": "true",
    "DEMO_MODE_GLOBAL_MOCK_RESET_PASSWORD": "true",
    "DEMO_MODE_DEMO_USERS": "{\"12345678910\":{\"DEMO_SSN\":\"10987654321\",\"DEMO_UPN\":\"per.son@domain.com\",\"DEMO_PHONE_NUMBER\":\"+4712345678\",\"MOCK_RESET_PASSWORD\":\"false\"}",
    "KRR_URL": "",
    "KRR_KEY": "",
    "SMS_URL": "",
    "SMS_KEY": "",
    "SMS_SENDER": "",
    "MONGODB_CONNECTION_STRING": "mongodb+srv://{db-test-user}:{db-test-user-password}@{clusteraddress}/?retryWrites=true&w=majority",
    "MONGODB_LOG_COLLECTION": "user-log",
    "MONGODB_USERS_COLLECTION": "users",
    "MONGODB_DB_NAME": "onboarding-test",
    "STATISTICS_URL": "",
    "STATISTICS_KEY": "",
    "BAD_WORDS": "kuk,fuck,knull,pule,...,pikk"
  },
  "Host": {
    "CORS": "*"
  }
}
```
- `func start`
- Kos deg