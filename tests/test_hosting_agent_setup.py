"""Run real setup parsers against fixtures, without Docker, root or live writes."""
import contextlib
import io
import json
import pathlib
import runpy
import sys
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
AGENT = ROOT / 'hosting-agent'
NETWORK_CHECK = (AGENT / 'install-networks.sh').read_text().split("python3 - <<'PY'\n", 1)[1].split('\nPY\n', 1)[0]


class NetworkOverlapTests(unittest.TestCase):
    def check_networks(self, networks):
        def docker(args, **kwargs):
            if args == ['docker', 'network', 'ls', '-q']:
                return ' '.join(str(i) for i in range(len(networks)))
            self.assertEqual(args[:3], ['docker', 'network', 'inspect'])
            return json.dumps(networks)
        with patch('subprocess.check_output', side_effect=docker):
            exec(compile(NETWORK_CHECK, 'install-networks.sh:overlap-check', 'exec'), {})

    def test_null_and_missing_ipam_config_are_safe(self):
        self.check_networks([
            {'Name': 'host', 'IPAM': {'Config': None}},
            {'Name': 'none', 'IPAM': {'Config': None}},
            {'Name': 'no-ipam', 'IPAM': None},
            {'Name': 'missing-ipam'},
            {'Name': 'missing-config', 'IPAM': {}},
            {'Name': 'empty', 'IPAM': {'Config': [None, {}, {'Subnet': None}]}},
        ])

    def test_foreign_overlap_still_blocks_after_null_networks(self):
        for subnet in ['172.31.240.0/24', '172.31.240.0/23', '172.31.241.0/24']:
            with self.subTest(subnet=subnet), self.assertRaisesRegex(SystemExit, 'Network overlap detected'):
                self.check_networks([
                    {'Name': 'host', 'IPAM': {'Config': None}},
                    {'Name': 'foreign', 'IPAM': {'Config': [{'Subnet': subnet}]}},
                ])

    def test_exact_existing_enrollment_and_unrelated_ipv6_are_allowed(self):
        self.check_networks([
            {'Name': 'hms-runtime', 'IPAM': {'Config': [{'Subnet': '172.31.240.0/24'}]}},
            {'Name': 'hms-build', 'IPAM': {'Config': [{'Subnet': '172.31.241.0/24'}]}},
            {'Name': 'ipv6', 'IPAM': {'Config': [{'Subnet': 'fd00::/64'}]}},
        ])

    def test_same_name_with_wrong_subnet_is_not_exempt(self):
        with self.assertRaisesRegex(SystemExit, 'Network overlap detected'):
            self.check_networks([{'Name': 'hms-runtime', 'IPAM': {'Config': [{'Subnet': '172.31.240.0/23'}]}}])

    def test_empty_inventory_is_safe(self):
        self.check_networks([])


class ComposeOverrideTests(unittest.TestCase):
    def run_override(self, service_config, config=None, inspect_config=None):
        labels = {'com.docker.compose.service': 'traefik',
                  'com.docker.compose.project.working_dir': '/fixture/traefik',
                  'com.docker.compose.project.config_files': '/fixture/traefik/compose.yml'}
        item = {'Config': {'Labels': labels}} if inspect_config is None else inspect_config
        resolved = {'services': {'traefik': service_config}} if config is None else config
        calls = []
        def docker(args, **kwargs):
            calls.append(args)
            if list(args[:2]) == ['docker', 'inspect']:
                return json.dumps([item])
            self.assertEqual(args[-3:], ['config', '--format', 'json'])
            return json.dumps(resolved)
        stdout = io.StringIO()
        with patch.object(sys, 'argv', ['persist-traefik-network.py', 'traefik']), \
             patch('subprocess.check_output', side_effect=docker), \
             patch.object(pathlib.Path, 'write_text') as write, \
             patch.object(pathlib.Path, 'chmod') as chmod, contextlib.redirect_stdout(stdout):
            error = None
            try:
                runpy.run_path(str(AGENT / 'persist-traefik-network.py'), run_name='__main__')
            except SystemExit as caught:
                error = str(caught)
            return error, write, chmod, stdout.getvalue(), calls

    def test_null_service_networks_preserve_implicit_default(self):
        error, write, chmod, _, _ = self.run_override({'networks': None})
        self.assertIsNone(error)
        networks = json.loads(write.call_args.args[0])['services']['traefik']['networks']
        self.assertEqual(networks, {'default': {}, 'hms-runtime': {'ipv4_address': '172.31.240.2'}})
        chmod.assert_called_once_with(0o644)

    def test_existing_networks_and_null_options_are_preserved_without_secrets(self):
        existing = {'proxy': None, 'socket-proxy': {'aliases': ['proxy-api']}}
        error, write, _, stdout, calls = self.run_override({'networks': existing, 'environment': {'PRIVATE_VALUE': 'fixture-must-stay-private'}})
        self.assertIsNone(error)
        value = json.loads(write.call_args.args[0])
        self.assertIsNone(value['services']['traefik']['networks']['proxy'])
        self.assertEqual(value['services']['traefik']['networks']['socket-proxy'], existing['socket-proxy'])
        self.assertNotIn('fixture-must-stay-private', stdout + write.call_args.args[0])
        self.assertTrue(all('up' not in command for command in calls))

    def test_shorthand_network_list_is_preserved(self):
        error, write, _, _, _ = self.run_override({'networks': ['proxy', 'socket-proxy']})
        self.assertIsNone(error)
        self.assertEqual(set(json.loads(write.call_args.args[0])['services']['traefik']['networks']), {'proxy', 'socket-proxy', 'hms-runtime'})

    def test_missing_service_or_null_config_refuses_to_write(self):
        for config in [{'services': None}, {'services': {'traefik': None}}, {}]:
            with self.subTest(config=config):
                error, write, chmod, _, _ = self.run_override(None, config=config)
                self.assertIn('Traefik service', error)
                write.assert_not_called()
                chmod.assert_not_called()

    def test_null_container_config_or_labels_refuses_to_write(self):
        for item in [{'Config': None}, {'Config': {'Labels': None}}]:
            with self.subTest(item=item):
                error, write, _, _, _ = self.run_override(None, inspect_config=item)
                self.assertIn('not linked to a Compose project', error)
                write.assert_not_called()

    def test_network_mode_refuses_incompatible_override(self):
        error, write, _, _, _ = self.run_override({'network_mode': 'host', 'networks': None})
        self.assertIn('network_mode', error)
        write.assert_not_called()


class PreflightNullTests(unittest.TestCase):
    def test_nullable_inspect_fields_are_reported_without_crashing(self):
        for config, settings in [(None, None), ({'Cmd': None, 'Labels': None, 'Image': 'traefik:v3'}, {'Networks': None})]:
            with self.subTest(config=config, settings=settings):
                item = {'Name': '/traefik', 'Config': config, 'NetworkSettings': settings}
                def command(args, **kwargs):
                    if list(args[:2]) == ['docker', 'ps']:
                        return json.dumps({'ID': 'fixture', 'Image': None}) + '\n' + json.dumps({'ID': 'traefik', 'Image': 'traefik:v3'})
                    if list(args[:2]) == ['docker', 'inspect']:
                        return json.dumps([item])
                    return 'fixture readonly inventory'
                stdout = io.StringIO()
                with patch('subprocess.check_output', side_effect=command), contextlib.redirect_stdout(stdout):
                    runpy.run_path(str(AGENT / 'preflight.py'), run_name='__main__')
                output = json.loads(stdout.getvalue().split('\nMemory:')[0])
                self.assertEqual(output['networks'], [])
                self.assertEqual(output['traefik_public_settings'], [])


if __name__ == '__main__':
    unittest.main()
