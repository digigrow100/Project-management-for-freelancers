#!/bin/sh
case "$1" in
 *Username*) printf '%s' 'x-access-token' ;;
 *) printf '%s' "$HMS_REPO_TOKEN" ;;
esac
