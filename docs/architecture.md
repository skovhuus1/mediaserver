# Arkitektur

## Runtime

BoltBytes er en modulær monolit med en separat worker-proces:

```text
Klient -> nginx:5555 -> Next admin:3000
                    -> Nest API:3001 -> PostgreSQL
                                    -> Redis
Worker ----------------------------> PostgreSQL job ledger
```

API’et ejer alle beslutninger om identitet, konto, plan, entitlement, playback-metode og streamgrænser. Klientfelter bruges kun som input og kan ikke ændre effektive rettigheder.

## Identitet

Access tokens er kortlivede JWT’er. Refresh tokens er tilfældige 384-bit værdier, og kun SHA-256-hash lagres. Rotation udføres i en serializable transaktion med conditional revoke; genbrug af et roteret token tilbagekalder hele tokenfamilien.

## Entitlements

Effektive rettigheder beregnes i denne rækkefølge:

```text
PlanVersion snapshot -> user override -> profile override
```

Kun kendte booleske og numeriske felter kan overrides. Release delay anvender UTC og clamped kalendermåneder, så 31. januar plus en måned bliver sidste gyldige dag i februar.

## Playback reservation

Reservationer serialiseres pr. bruger med en PostgreSQL transaction-level advisory lock. Inde i samme transaktion ryddes udløbne leases, aktive slots tælles, og session plus reservation oprettes. En afbrudt transaktion kan derfor ikke efterlade en halv reservation.

Heartbeat og stop kræver både account scope og session-ejerskab. Administrator/operator kan se kontosessions; almindelige brugere kan kun se og ændre egne sessions.

## Worker

Jobs er vedvarende rækker i `system_jobs`. Workers claimer med `FOR UPDATE SKIP LOCKED`, skriver `job_attempts`, holder lease og bruger eksponentiel retry. Ukendte jobtyper fejler eksplicit og markeres aldrig som gennemført.
