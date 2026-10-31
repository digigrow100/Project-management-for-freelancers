import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts/email/server'))
from mail_delivery import check
class Delivery(unittest.TestCase):
 def setUp(self):
  self.policy={'mx_host':'mail.example.test','spf':'v=spf1 ip4:62.171.130.156 -all'};self.panel={'domain':'example.test','dkim_selector':'hms1','dkim_public':'-----BEGIN PUBLIC KEY-----\nTESTKEY\n-----END PUBLIC KEY-----'}
  self.rows={('MX','example.test'):['10 mail.example.test.'],('TXT','example.test'):['v=spf1 ip4:62.171.130.156 -all'],('TXT','hms1._domainkey.example.test'):['v=DKIM1; k=rsa; p=TESTKEY'],('TXT','_dmarc.example.test'):['v=DMARC1; p=none'],('A','mail.example.test'):['62.171.130.156'],('PTR','156.130.171.62.in-addr.arpa'):['mail.example.test.']}
 def report(self):return check(self.policy,self.panel,resolver=lambda k,n:self.rows.get((k,n),[]),tls=lambda:'matched')
 def test_matches_still_do_not_claim_delivery(self):
  r=self.report();self.assertTrue(r['can_send']);self.assertTrue(r['can_receive']);self.assertFalse(r['delivery_verified'])
 def test_multiple_spf_or_wrong_dkim_block_sending(self):
  self.rows[('TXT','example.test')].append('v=spf1 -all');r=self.report();self.assertEqual(r['checks']['spf'],'different');self.assertFalse(r['can_send'])
  self.rows[('TXT','example.test')].pop();self.rows[('TXT','hms1._domainkey.example.test')]=['p=OTHERKEY'];self.assertFalse(self.report()['can_send'])
 def test_missing_and_unavailable_are_not_success(self):
  del self.rows[('MX','example.test')];self.assertFalse(self.report()['can_receive'])
  def fail(*a):raise TimeoutError('private resolver detail')
  r=check(self.policy,self.panel,resolver=fail,tls=lambda:'unavailable');self.assertTrue(all(v=='unavailable'for v in r['checks'].values()));self.assertFalse(r['can_send']);self.assertNotIn('private',str(r))
if __name__=='__main__':unittest.main()
