# onboarding-api
API for å onboarde folk

# Flyt
## Hovedflyt
- Trykk "Få engangspassord på sms"
- Id-port-login
- Får sms
  - Gå til aka.ms/mfasetup
- Får sms
  - Engangspassord
- Setter nytt passord, og to-faktor, oog tlf... (eller e-post)
- Ferdig

## Alternativ flyt
- Gå til servicedesk

## Ny hovedflyt?
- Trykk - "sett nytt passord"
- Id-port-login
- Sett nytt passord
  - Send request med nytt passord til API
- Api oppretter en jobb i mongodb - kryptert passord, med brukernavn / fnr fra id-porten
- Jobb on-prem lytter på nye oppføringer i mongodb setter det nye passordet i AD - setter mongodb objektet til fullført
- Når passord er...

## Alternativ
- Trykk - "sett nytt passord"
- Id-port-login
- Sett nytt passord
- Send request med nytt passord til API - API er on-prem



# Trenger Application Permissions
- Application.Read.All
- CustomSecAttributeAssignment.Read.All
- User.Read.All
- User.ReadWrite.All // Kanskje ittte?
- UserAuthenticationMethod.ReadWrite.All
- Enterprise appen MÅ også være USER ADMINISTRATOR! (nope trenger ikke lenger)
- OIOIOI - vi må kjøre ROPC (resource owner password credentials - kun backend), sammen med client secret, service bruker må ha noen roller. Spør Bjørn. https://learn.microsoft.com/en-us/graph/api/authenticationmethod-resetpassword?view=graph-rest-1.0&tabs=http


# Flyt for id-porten

- Klient kaller på API/getLoginUrl
  - Her settes state, for å "binde" sluttbruker api-kall mot apiet api-kall mot idporten (så de har en felles context)
  - Nonce (number used once). Den trenger ikke sluttbruker bry seg med tror jeg. Nonce går til brukeren. Den må så verifiseres når vi får tilbake id-tokenet. Den er da IKKE med i spørring etter token.
  - code_challenge_method (sha256) og code_challenge - generer vi i API-et, men vi må cache / spare på code_verifier. Når vi spør om token etterpå - så slenger vi med code_verifier, så ingen kan ha hacka sluttbrukeren og hijacke pålogginga.
- Klient går til url-en den fikk (idporten.no/blabaoabla)
- idporten redirecter tilbake til frontend/resetPassword ellerno med en code
- Klient sender code over til API/ResetPassword
- API gjør
  - Validerer code?
  - Bruker client secret og client information fra idporten/sjolvbetjening - henter idtoken/accesstoken (dette er da bare i backend, går aldri tilbake til frontend)
  - Finner entra-bruker via fnr i id-token
  - Resetter passord på bruker
  - Sender passord på sms
  - Kanskje logge ut fra id-porten?
  - Returnerner til fronten "Det gikk bra, vi sendte sms til ****4980"
- Klient tar i mot og er fornøyd


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
