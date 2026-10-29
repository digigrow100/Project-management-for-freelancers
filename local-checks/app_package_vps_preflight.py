#!/usr/bin/env python3
"""Read-only metadata for App Hosting rollout. No customer reads or mutations."""
import json
import os
from pathlib import Path
import shutil
import subprocess


def check(args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=4, check=False)
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def main():
    settings = Path('/etc/housemysite-services/settings.json')
    config = {}
    readable = False
    try:
        if settings.stat().st_size <= 1024 * 1024:
            config = json.loads(settings.read_text())
            readable = isinstance(config, dict)
    except (OSError, ValueError):
        pass
    if not readable:
        config = {}
    provisioning = config.get('provisioning', {})
    pins = provisioning.get('packages', {}) if isinstance(provisioning, dict) else {}
    expected = {
        'starter': 'e4af1363-0bfa-4abd-a7cc-99f8b41ad26b',
        'business': '95292b09-bc9d-4710-908f-cb2c6209e06b',
        'pro': '56d564c9-4ede-477b-8464-c3a5f552a19d',
    }
    print(json.dumps({
        'read_only': True,
        'production_ready': False,
        'scope': 'system metadata only; no customer files, mail or database contents',
        'settings_readable': readable,
        'services_active': check(['systemctl', 'is-active', '--quiet', 'housemysite-services']),
        'provider_enrolled': bool(config.get('provider')),
        'management_enrolled': bool(config.get('management')),
        'provisioning_enrolled': bool(provisioning),
        'package_policy_pins_present': {name: isinstance(pins, dict) and package in pins for name, package in expected.items()},
        'nextjs_sources_enrolled': bool(config.get('sources')),
        'backup_settings_present': Path('/etc/housemysite-backups/backups.json').is_file(),
        'cgroup_v2_present': Path('/sys/fs/cgroup/cgroup.controllers').is_file(),
        'cpu_count': os.cpu_count(),
        'quota_tools_present': {name: shutil.which(name) is not None for name in ('setquota', 'repquota', 'xfs_quota')},
        'node_present': shutil.which('node') is not None,
        'mariadb_active': check(['systemctl', 'is-active', '--quiet', 'mariadb']),
        'dovecot_active': check(['systemctl', 'is-active', '--quiet', 'dovecot']),
        'postfix_active': check(['systemctl', 'is-active', '--quiet', 'postfix']),
        'apache_active': check(['systemctl', 'is-active', '--quiet', 'apache2']),
        'note': 'Policy pins and installed tools alone do not prove enforcement. App contracts remain blocked until account-wide controls and live readback are implemented and verified.',
    }, sort_keys=True))


if __name__ == '__main__':
    main()
