# onboarding-api
API for å onboarde folk

# Reset passord flyt
- Bruker kommer til portal - velger om hen er ansatt eller elev
- Trykker på tilbakestill passord / aktiver konto - får tilbake en loginurl for idporten, browser redirecter til loginurl
- Elever får lov å bruker MinID (substancial), ansatte må på high (bankid og sånn)
- Idporten redirecter tilbake til callback
- Callback sender over code og state og iss til resetpassword
- API tar i mot code, state, og iss, logger inn bruker på idporten her i BFF-en.
- Så skjer moroa
  - Henter fnr fra idporten
  - Henter bruker fra EntraID
  - Henter tlfnr fra KRR
  - Resetter passordet til no random greier
  - Sender nytt passord på sms
  - Lagrer alt som logEntry greier i mongoDB
  - Returnerer brukernavn, navn og maskert tlf-nr (som sms ble sendt til)
- Browsern viser så litt info om hva bruker må gjøre videre
- Bruker må klikke på "trykk her", blir så sendt til enterprise app / ENTRA_CLIENT - som IKKE har MFA-CA-policy på seg (grunnet forferdelig rekkefølge hos Microsoft - vi vil at brukeren må sette nytt passord FØR mfa)
  - Her må bruker putte inn engangs/togangspassordet - for så å sette seg et nytt passord
- Deretter blir brukeren redirected tilbake til frontend med code og state, sender over code og state til api her igjen, og blir logga inn i Entra
- Deretter blir de redirected til MFA-enterprise-appen, må logge inn med tofaktor, sendt tilbake med state og code, og deretter logges nok en gang inn i backend - og backend kan sette denne prosessen til ferdig.

- Da kan hele loggingen skje basert på hendelsene, trenger ikke timer-trigger jobber- Dersom vi krever at det er DENNE prosessen som følges for at vi verfiiserer bruker.

Når de kommer tilbake fra entra-pålogging MED MFA - så setter vi logg-oppføringen til ferdig. HAr de ikke gjort dette, må de gjøre det på nytt, og loggoppføringen er feilet.


# Ny tanke?
- Etter idporten, lag en oppføring på brukeren
- Etter MFA-login - fullfør den samme oppføringen
- Spørsmål - hvordan knyttes oppføringene?
- State i OIDC?
- Titsvindu? Innen en viss tid?
- Nei - state, den har kort elvetid og er unik. Kobles på mongodb-oppføringen.
- Da kan vi faktsik verifisere at det gjøres via løsningen vår.
- Trenger ikke schedules.
- Så lenge en state opprettes - lagres i mongodb, forsvinner den ikke, og kan brukes i løsningen.
- Hva om brukeren var halvferdig. Og begynte igjen. Kan tvinge id-porten og ny oppføring.

# Flyt
- Frontend - velg elev eller ansatt
- Frontend - velg reset passord eller verifiser bruker - sender med userType og action til api
- Reset passord
  - Logg inn idporten - returnerer state og code, sender til API - lagrer mongodb. Resetter passord, returner data + en id for oppføringen
  - Trykk her når du har fått sms
  - Sender deg til password-appreg, med id som state
  - Returnerer med code + state
  - API tar i mot code og state - lagrer at passord er resatt. Returnerer data + den samme id-en for oppføringen i mongodb
  - Frontend sender så til mfa-appreg, med id som state
  - API tar i mot code og state - lagrer at MFA også er good - og at prosessen er ferdig. Returnerer data.

Kan det hackes?
Alle api-kallene krever en code, som kommer fra en innlogging.
Vi kan også verifisere at det er riktig bruker i mongodb mot code/token, får å sikre at noen ikke tukler med state. 

- Fiks appregs og test ordentlig :)

# Full-report
- TODO

# Update-log-entries
- TODO
- For resett passord
  - Er passord satt?
  - Er mfa


# Trenger API Permissions
- OIOIOI - vi må kjøre ROPC (resource owner password credentials - kun backend), sammen med client secret, service bruker må ha noen roller. Spør Bjørn. https://learn.microsoft.com/en-us/graph/api/authenticationmethod-resetpassword?view=graph-rest-1.0&tabs=http

- API permissions (Graph)
CustomSecAttributeAssignment.Read.All (leser fnr for elever) (Application)
User.Read.All (leser fnr for ansatte) (Application)
UserAuthenticationMethod.Read.All (sjekker mfa og passord) (Application)
UserAuthenticationMethod.ReadWrite.All (Trengs kun i prod - der det faktisk skal resettes passord) (Delegated)


# Flyt for id-porten

- Browser kaller på API/getLoginUrl
  - Her settes state, for å "binde" sluttbruker api-kall mot apiet api-kall mot idporten (så de har en felles context)
  - Nonce (number used once). Den trenger ikke sluttbruker bry seg med tror jeg. Nonce går til brukeren. Den må så verifiseres når vi får tilbake id-tokenet. Den er da IKKE med i spørring etter token.
  - code_challenge_method (sha256) og code_challenge - generer vi i API-et, men vi må cache / spare på code_verifier. Når vi spør om token etterpå - så slenger vi med code_verifier, så ingen kan ha hacka sluttbrukeren og hijacke pålogginga.
- Browser går til url-en den fikk (idporten.no/blabaoabla)
- idporten redirecter tilbake til frontend/idportencallback ellerno med en code
- Browser sender code over til API/ResetPassword
- Browser får tilbake litt info og er forhåpentligvis fornøyd


# DEMO
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

// Add rule to DEMO_MODE_DEMO_USERS env variable, and set DEMO_MODE_ENABLED to "true" in env variabels
```

# Rapport ?
- Hent alle aktive brukere fra graph
- Hent hele id-porten collection ! Kan vi hente bare de som det har skjedd endringer med?
- Har vi stort nok minne for å ha alle der? Ja.
- Da kan vi sammenligne in memory bare, og skrive til mongodb report-collection. Lagrer med user-id som key, og department, company, blablabla
- Gjør det en gang på natta ellerno
- Da kan man bruke report-collection til å hente/lese statistikk, samtidig som vi har en fin logg på hva som skjer og hvem som driver med ting


# HELT BANEBRYTENDE IDE! (nej)
- TRIGGER? Trigger er reset passord-knappen.
- Trigger let gjennom en gang i timen.
- Hva om vi setter en custom security attribut på alle som HAR satt opp 2-faktor bak id-porten
- Extensionattributt_idporten - verified: "idporten-level-oid__timestamp"
- Hent alle som IKKE har satt den, ta med litt company osv
- Sjekk alle som ikke er fullført i logCollection. Når de er fullført, sett også extension_idporten_verified.
- Hent alle som ikke har extension_idporten_verified, en gang i timen. Skriv dem til en report-collection.


- En fullsynk hver natt
- En synk som kjører hver time og bare oppdaterer de det faktisk har skjedd no med. Om de ikke eksisiterer (er helt nye / sletta), så får de bare vente pent til nattsynken? Eller addes as we go?
  - Denne synken er uansett den som sjekker nye oppføringer, og om de har satt passord og mfa.

