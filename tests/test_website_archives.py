import importlib.util,pathlib,tempfile,unittest,zipfile,io,tarfile
module=importlib.util.spec_from_file_location('website_archive','hosting-agent/src/archive.py')
archive=importlib.util.module_from_spec(module);module.loader.exec_module(archive)
class WebsiteArchiveTests(unittest.TestCase):
 def test_zip_fits_and_unwraps_single_project_folder(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);source=root/'site.zip'
   with zipfile.ZipFile(source,'w') as z:z.writestr('site/index.html','fixture');z.writestr('site/.env','private fixture excluded')
   self.assertEqual(archive.extract('zip',source,root/'out',100),7)
   self.assertEqual((root/'out/index.html').read_text(),'fixture');self.assertFalse((root/'out/.env').exists())
 def test_expanded_quota_is_checked_before_publication(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);source=root/'site.zip'
   with zipfile.ZipFile(source,'w',compression=zipfile.ZIP_DEFLATED) as z:z.writestr('index.html','x'*200)
   with self.assertRaisesRegex(ValueError,'storage_limit_exceeded'):archive.extract('zip',source,root/'out',100)
   self.assertFalse((root/'out').exists())
 def test_tar_keeps_only_safe_npm_bin_links_inside_the_artifact(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);source=root/'artifact.tar'
   with tarfile.open(source,'w') as t:
    f=tarfile.TarInfo('output/app/node_modules/pkg/cli.js');f.size=7;t.addfile(f,io.BytesIO(b'fixture'))
    link=tarfile.TarInfo('output/app/node_modules/.bin/pkg');link.type=tarfile.SYMTYPE;link.linkname='../pkg/cli.js';t.addfile(link)
   self.assertEqual(archive.extract('tar',source,root/'out',100,'artifact'),7)
   self.assertEqual((root/'out/app/node_modules/.bin/pkg').read_text(),'fixture')
if __name__=='__main__':unittest.main()
