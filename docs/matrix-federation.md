# Andere Matrix-Instanzen nutzen

In der linken Leiste öffnet der Globus **Explore Matrix servers**. Einen Matrix-Servernamen wie `matrix.org` eingeben, um dessen öffentliche Räume zu durchsuchen. Alternativ direkt `#raum:example.org`, eine Raum-ID oder einen `https://matrix.to/#/...`-Link einfügen. Routing-Server (`via`) aus Links werden übernommen. Öffentliche Spaces können ebenfalls beigetreten werden; private Räume benötigen eine Einladung.

Unter **Home → Add people** die vollständige ID `@name:anderer-server.org` eingeben und **Message** wählen. Das funktioniert auch, wenn die Person nicht im Suchverzeichnis erscheint. Neue Direktnachrichten werden Ende-zu-Ende verschlüsselt erstellt. Eine Namenssuche durchsucht das Verzeichnis des eigenen Homeservers, kein weltweites Nutzerverzeichnis.

Das bestehende Konto bleibt auf seinem Homeserver. Über Föderation tritt es Räumen anderer Instanzen bei und lädt deren Nutzer zu Gesprächen ein. Dies ist kein Kontowechsel und legt kein zusätzliches Konto an.

## Homeserver-Einstellungen (Synapse)

Die tatsächliche Serverkonfiguration liegt außerhalb dieses Frontend-Repositories und wurde nicht verändert oder live getestet.

- `federation_domain_whitelist` muss die gewünschten Gegenstellen erlauben. Nicht gesetzt oder `null` erlaubt alle Domains; `[]` deaktiviert Föderation.
- Der Synapse-Listener muss die Ressource `federation` bedienen. Der Reverse Proxy muss Matrix-Föderationsanfragen weiterleiten, einschließlich `/_matrix/federation/` und `/_matrix/key/`. Dafür kann die übliche Weiterleitung von `/_matrix` verwendet werden.
- Der Server muss von außen mit gültigem TLS erreichbar sein: standardmäßig Port 8448 oder ein per Delegation bekanntgegebenes Ziel, beispielsweise Port 443 über `/.well-known/matrix/server`. Die Client-Discovery allein über `/.well-known/matrix/client` reicht hierfür nicht aus.
- Bei ausgehenden Firewall-Regeln TCP 443 und 8448 zu anderen Homeservern erlauben.
- `allow_public_rooms_over_federation: true` ist optional: Es erlaubt anderen Instanzen, **das eigene öffentliche Raumverzeichnis** abzufragen. Für DMs und den Beitritt per bekannter Adresse ist es nicht erforderlich. Zum Durchsuchen eines fremden Verzeichnisses muss dessen Betreiber den Zugriff erlauben. Synapse deaktiviert dies standardmäßig.
- Raumregeln und `m.room.server_acl` können einzelne Beitritte zusätzlich beschränken. Ein Raum mit `m.federate: false` kann nicht nachträglich für Föderation geöffnet werden.

Nach einer Änderung die Synapse-Konfiguration prüfen und den Dienst gemäß der eigenen Installation neu starten.

Offizielle Referenzen:

- [Synapse-Konfiguration](https://element-hq.github.io/synapse/latest/usage/configuration/config_documentation.html)
- [Reverse Proxy](https://element-hq.github.io/synapse/latest/reverse_proxy.html)
- [Föderations-Delegation](https://element-hq.github.io/synapse/latest/delegate.html)
- [Netzwerk und Ports](https://element-hq.github.io/synapse/latest/setup/security.html)
