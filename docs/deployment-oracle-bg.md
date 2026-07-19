# Разгръщане на Oracle (първоначален вариант)

> Този документ описва ръчното първоначално разгръщане на Go/Node API-то върху
> Oracle Always Free ARM64 виртуална машина. Автоматизираният deploy през
> GitHub Actions се добавя в задача 35. Плейсхолдър домейните
> `rod.mitovski.example` / `api.rod.mitovski.example` се заменят с реални само в
> DNS и env файловете — никога в кода.

## 1. Виртуална машина

1. Създайте **VM.Standard.A1.Flex** (Ampere, `linux/arm64`) с Ubuntu LTS в
   Oracle Cloud (Always Free).
2. Заделете **резервиран публичен IP** (Reserved Public IP) и го закачете за VM-а.
3. При създаване подайте съдържанието на [`infra/oracle/cloud-init.yaml`](../infra/oracle/cloud-init.yaml)
   като *cloud-init* скрипт, след като замените:
   - `<ADMIN_SSH_PUBLIC_KEY>` — вашия публичен SSH ключ;
   - `<ADMIN_IP>` — вашия IP адрес (SSH се отваря само за него).

Cloud-init инсталира Docker + compose, създава потребителя `deploy`, вдига
host firewall (UFW) и подготвя `/opt/familytree`.

## 2. DNS

```text
rod.mitovski.example       → Vercel
api.rod.mitovski.example   → <резервирания публичен IP на Oracle>
```

Изчакайте DNS да се разпространи, преди да пуснете Caddy (нужно е за издаване на
TLS сертификат).

## 3. Мрежа и firewall

Правилата (OCI security list + UFW) са описани в
[`infra/oracle/firewall.md`](../infra/oracle/firewall.md). Отворени са само
`80`, `443` и `22` (само за администратора). Портове `5432`, `8080`, `3000`
**никога** не се отварят.

## 4. Файлове на сървъра

Копирайте нужното в `/opt/familytree` (потребител `deploy`):

```sh
scp infra/oracle/docker-compose.prod.yml deploy@<IP>:/opt/familytree/
scp infra/oracle/Caddyfile               deploy@<IP>:/opt/familytree/
scp -r infra/oracle/initdb               deploy@<IP>:/opt/familytree/
scp infra/oracle/env.example             deploy@<IP>:/opt/familytree/.env
```

На сървъра редактирайте `/opt/familytree/.env` с реалните стойности и заключете
правата:

```sh
chmod 600 /opt/familytree/.env
```

Важно: `SERVICE_ID` и `SERVICE_HMAC_SECRET` трябва да съвпадат със стойностите
във Vercel. `APP_DB_USER` е роля с минимални права — приложението никога не се
свързва като суперпотребител.

## 5. Първо разгръщане

```sh
cd /opt/familytree

# 1. Изтеглете образа (задайте API_IMAGE в .env към конкретен commit SHA).
docker compose -f docker-compose.prod.yml pull

# 2. Изпълнете миграциите ПРЕДИ да вдигнете API-то.
docker compose -f docker-compose.prod.yml --profile ops run --rm migrate

# 3. Вдигнете стека.
docker compose -f docker-compose.prod.yml up -d

# 4. Проверете здравето.
docker compose -f docker-compose.prod.yml ps
curl -fsS https://api.rod.mitovski.example/health
```

## 6. Как работи TLS

Caddy автоматично издава и подновява сертификат за `API_DOMAIN` през Let's
Encrypt при първото стартиране (затова DNS трябва да сочи към сървъра
предварително и портове 80/443 да са отворени). Сертификатите се пазят в
Docker volume-а `caddy_data`.

## 7. Проверки след разгръщане

```sh
# Нищо чувствително не слуша публично (само 80/443 на caddy).
sudo ss -tlnp | grep -E '0.0.0.0|:::'

# postgres и api нямат публикуван host порт.
docker compose -f docker-compose.prod.yml ps --format '{{.Service}} {{.Ports}}'

# Firewall.
sudo ufw status verbose
```

Разгръщането на web частта (Vercel) и автоматизираният API deploy се
финализират в задача 35.
