# ============================================
# Makefile - Dilemma Backend
# ============================================

.PHONY: help install dev build start clean test lint docker-up docker-down migrate seed studio

# Variables
DOCKER_COMPOSE = docker-compose
NPM = npm

# Couleurs pour les messages
GREEN = \033[0;32m
YELLOW = \033[0;33m
RED = \033[0;31m
NC = \033[0m # No Color

## help: Affiche cette aide
help:
	@echo "$(GREEN)Commandes disponibles:$(NC)"
	@echo ""
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## /  /' | column -t -s ':'
	@echo ""

## install: Installe les dépendances
install:
	@echo "$(YELLOW)Installation des dépendances...$(NC)"
	$(NPM) install
	@echo "$(GREEN)✓ Dépendances installées$(NC)"

## setup: Configuration initiale complète (install + env + migrate + seed)
setup: install env migrate seed
	@echo "$(GREEN)✓ Configuration terminée !$(NC)"
	@echo "$(YELLOW)Vous pouvez maintenant lancer: make dev$(NC)"

## env: Crée le fichier .env depuis .env.example
env:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "$(GREEN)✓ Fichier .env créé$(NC)"; \
		echo "$(YELLOW)⚠  N'oubliez pas de le configurer !$(NC)"; \
	else \
		echo "$(YELLOW)⚠  .env existe déjà$(NC)"; \
	fi

## dev: Démarre le serveur en mode développement
dev:
	@echo "$(YELLOW)Démarrage du serveur...$(NC)"
	$(NPM) run dev

## build: Compile le TypeScript en JavaScript
build:
	@echo "$(YELLOW)Compilation...$(NC)"
	$(NPM) run build
	@echo "$(GREEN)✓ Compilation terminée$(NC)"

## start: Démarre le serveur en mode production
start: build
	@echo "$(YELLOW)Démarrage en production...$(NC)"
	$(NPM) start

## clean: Nettoie les fichiers de build
clean:
	@echo "$(YELLOW)Nettoyage...$(NC)"
	rm -rf dist
	rm -rf node_modules
	rm -rf coverage
	@echo "$(GREEN)✓ Nettoyage terminé$(NC)"

## test: Lance les tests
test:
	@echo "$(YELLOW)Lancement des tests...$(NC)"
	$(NPM) test

## lint: Vérifie le code avec ESLint
lint:
	@echo "$(YELLOW)Vérification du code...$(NC)"
	$(NPM) run lint

## lint-fix: Corrige automatiquement les erreurs ESLint
lint-fix:
	@echo "$(YELLOW)Correction du code...$(NC)"
	$(NPM) run lint -- --fix
	@echo "$(GREEN)✓ Code corrigé$(NC)"

## docker-up: Démarre tous les services Docker
docker-up:
	@echo "$(YELLOW)Démarrage de Docker...$(NC)"
	$(DOCKER_COMPOSE) up -d
	@echo "$(GREEN)✓ Services démarrés$(NC)"
	@echo "$(YELLOW)Backend: http://localhost:3000$(NC)"
	@echo "$(YELLOW)Prisma Studio: http://localhost:5555$(NC)"
	@echo "$(YELLOW)Redis Commander: http://localhost:8081$(NC)"

## docker-down: Arrête tous les services Docker
docker-down:
	@echo "$(YELLOW)Arrêt de Docker...$(NC)"
	$(DOCKER_COMPOSE) down
	@echo "$(GREEN)✓ Services arrêtés$(NC)"

## docker-logs: Affiche les logs Docker
docker-logs:
	$(DOCKER_COMPOSE) logs -f

## docker-restart: Redémarre tous les services Docker
docker-restart: docker-down docker-up
	@echo "$(GREEN)✓ Services redémarrés$(NC)"

## docker-clean: Nettoie tous les conteneurs, volumes et images Docker
docker-clean:
	@echo "$(RED)⚠  Ceci va supprimer TOUTES les données Docker !$(NC)"
	@read -p "Êtes-vous sûr ? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		$(DOCKER_COMPOSE) down -v --remove-orphans; \
		docker system prune -af --volumes; \
		echo "$(GREEN)✓ Docker nettoyé$(NC)"; \
	fi

## migrate: Crée et applique les migrations Prisma
migrate:
	@echo "$(YELLOW)Application des migrations...$(NC)"
	$(NPM) run prisma:migrate
	@echo "$(GREEN)✓ Migrations appliquées$(NC)"

## migrate-create: Crée une nouvelle migration
migrate-create:
	@read -p "Nom de la migration: " name; \
	$(NPM) run prisma:migrate -- --name $$name

## migrate-reset: Réinitialise la base de données (⚠️ PERTE DE DONNÉES)
migrate-reset:
	@echo "$(RED)⚠  Ceci va SUPPRIMER TOUTES les données !$(NC)"
	@read -p "Êtes-vous sûr ? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		npx prisma migrate reset --force; \
		echo "$(GREEN)✓ Base de données réinitialisée$(NC)"; \
	fi

## seed: Remplit la base avec des données de test
seed:
	@echo "$(YELLOW)Seeding de la base de données...$(NC)"
	$(NPM) run prisma:seed
	@echo "$(GREEN)✓ Données de test insérées$(NC)"

## studio: Ouvre Prisma Studio (interface graphique DB)
studio:
	@echo "$(YELLOW)Ouverture de Prisma Studio...$(NC)"
	@echo "$(YELLOW)Accessible sur: http://localhost:5555$(NC)"
	$(NPM) run prisma:studio

## generate: Génère le client Prisma
generate:
	@echo "$(YELLOW)Génération du client Prisma...$(NC)"
	$(NPM) run prisma:generate
	@echo "$(GREEN)✓ Client Prisma généré$(NC)"

## db-push: Synchronise le schéma Prisma avec la DB (dev uniquement)
db-push:
	@echo "$(YELLOW)Synchronisation du schéma...$(NC)"
	npx prisma db push
	@echo "$(GREEN)✓ Schéma synchronisé$(NC)"

## backup: Crée une sauvegarde de la base de données
backup:
	@echo "$(YELLOW)Création d'une sauvegarde...$(NC)"
	@mkdir -p backups
	@timestamp=$$(date +%Y%m%d_%H%M%S); \
	$(DOCKER_COMPOSE) exec -T postgres pg_dump -U postgres dilemma_db > backups/backup_$$timestamp.sql; \
	echo "$(GREEN)✓ Sauvegarde créée: backups/backup_$$timestamp.sql$(NC)"

## restore: Restaure une sauvegarde (BACKUP_FILE=chemin/vers/backup.sql)
restore:
	@if [ -z "$(BACKUP_FILE)" ]; then \
		echo "$(RED)Erreur: Spécifiez BACKUP_FILE=chemin/vers/backup.sql$(NC)"; \
		exit 1; \
	fi
	@echo "$(YELLOW)Restauration de $(BACKUP_FILE)...$(NC)"
	@echo "$(RED)⚠  Ceci va écraser les données actuelles !$(NC)"
	@read -p "Continuer ? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		cat $(BACKUP_FILE) | $(DOCKER_COMPOSE) exec -T postgres psql -U postgres dilemma_db; \
		echo "$(GREEN)✓ Sauvegarde restaurée$(NC)"; \
	fi

## logs: Affiche les logs de l'application
logs:
	@if [ -f logs/app.log ]; then \
		tail -f logs/app.log; \
	else \
		echo "$(YELLOW)Aucun fichier de log trouvé$(NC)"; \
	fi

## health: Vérifie la santé de l'API
health:
	@echo "$(YELLOW)Vérification de la santé de l'API...$(NC)"
	@curl -s http://localhost:3000/health | jq . || echo "$(RED)API non disponible$(NC)"

## stats: Affiche les statistiques de la base de données
stats:
	@echo "$(YELLOW)Statistiques de la base de données:$(NC)"
	@echo ""
	@$(DOCKER_COMPOSE) exec postgres psql -U postgres -d dilemma_db -c "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"

## audit: Vérifie les vulnérabilités npm
audit:
	@echo "$(YELLOW)Audit de sécurité...$(NC)"
	$(NPM) audit
	@echo "$(YELLOW)Pour corriger automatiquement: make audit-fix$(NC)"

## audit-fix: Corrige automatiquement les vulnérabilités
audit-fix:
	@echo "$(YELLOW)Correction des vulnérabilités...$(NC)"
	$(NPM) audit fix
	@echo "$(GREEN)✓ Vulnérabilités corrigées$(NC)"

## update: Met à jour toutes les dépendances
update:
	@echo "$(YELLOW)Mise à jour des dépendances...$(NC)"
	$(NPM) update
	@echo "$(GREEN)✓ Dépendances mises à jour$(NC)"

## ps: Affiche l'état des conteneurs Docker
ps:
	$(DOCKER_COMPOSE) ps

## shell: Ouvre un shell dans le conteneur backend
shell:
	$(DOCKER_COMPOSE) exec backend sh

## db-shell: Ouvre un shell PostgreSQL
db-shell:
	$(DOCKER_COMPOSE) exec postgres psql -U postgres -d dilemma_db

## redis-cli: Ouvre le CLI Redis
redis-cli:
	$(DOCKER_COMPOSE) exec redis redis-cli

## format: Formate le code avec Prettier (si configuré)
format:
	@echo "$(YELLOW)Formatage du code...$(NC)"
	@if command -v prettier > /dev/null; then \
		prettier --write "src/**/*.{ts,js,json}"; \
		echo "$(GREEN)✓ Code formaté$(NC)"; \
	else \
		echo "$(YELLOW)Prettier non installé. Installez-le avec: npm i -D prettier$(NC)"; \
	fi

## quick: Démarrage rapide complet (docker-up + migrate + seed + logs)
quick: docker-up
	@sleep 5
	@make migrate
	@make seed
	@echo "$(GREEN)✓ Tout est prêt !$(NC)"
	@make docker-logs

# Valeur par défaut
.DEFAULT_GOAL := help