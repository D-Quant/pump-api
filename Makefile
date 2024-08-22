.PHONY: debug build remove cleanup

## 本地测试
debug:
	echo "debug"

## 编译
build:
	docker build -t pump-api .

cleanup:
	chmod +x cleanup.sh
	sh cleanup.sh

remove:
	chmod +x remove.sh
	sh remove.sh

## Show help
help:
	@echo ''
	@echo 'Usage:'
	@echo ' make target'
	@echo ''
	@echo 'Targets:'
	@awk '/^[a-zA-Z\-\_0-9]+:/ { \
	helpMessage = match(lastLine, /^## (.*)/); \
	if (helpMessage) { \
	helpCommand = substr($$1, 0, index($$1, ":")-1); \
	helpMessage = substr(lastLine, RSTART + 3, RLENGTH); \
	printf " %-20s %s\n", helpCommand, helpMessage; \
	} \
	} \
	{ lastLine = $$0 }' $(MAKEFILE_LIST)