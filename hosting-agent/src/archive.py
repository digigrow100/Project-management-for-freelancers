"""Bounded extraction of untrusted site files. Never follows links or extracts special files."""
import os, pathlib, shutil, stat, sys, tarfile, zipfile
MAX_FILES=20000
BLOCKED={'.git','node_modules','.npm','id_rsa','id_ed25519'}
def safe_parts(name):
    if not name or len(name)>500 or name.startswith('/') or '\\' in name or ':' in name or any(ord(c)<32 for c in name):
        raise ValueError('invalid_archive_path')
    parts=pathlib.PurePosixPath(name).parts
    if any(p in ('..','.') for p in parts):raise ValueError('invalid_archive_path')
    return parts

def extract(kind,archive,destination,limit,mode='source'):
    root=pathlib.Path(destination);root.mkdir(parents=True,exist_ok=False)
    size=0;count=0;seen=set();links=[]
    def target(name,length):
        nonlocal size,count
        parts=safe_parts(name)
        # Docker archive has a fixed top-level directory. ZIP may have a repo folder.
        if kind=='tar':parts=parts[1:]
        if not parts:return None
        if mode=='source' and any(p in BLOCKED or p=='.env' or p.startswith('.env.') for p in parts):return None
        path=root.joinpath(*parts)
        if path in seen:raise ValueError('duplicate_archive_path')
        seen.add(path);count+=1;size+=length
        if count>(100000 if mode=='artifact' else MAX_FILES) or length<0 or size>limit:raise ValueError('storage_limit_exceeded')
        path.parent.mkdir(parents=True,exist_ok=True)
        return path
    try:
        if kind=='zip':
            with zipfile.ZipFile(archive) as z:
                if len(z.infolist())>MAX_FILES:raise ValueError('too_many_files')
                for info in z.infolist():
                    parts=safe_parts(info.filename)
                    unixmode=info.external_attr>>16
                    if stat.S_ISLNK(unixmode) or (stat.S_IFMT(unixmode) not in (0,stat.S_IFREG,stat.S_IFDIR)):raise ValueError('archive_links_forbidden')
                    if info.flag_bits&1:raise ValueError('encrypted_archive_forbidden')
                    if info.is_dir():continue
                    out=target(info.filename,info.file_size)
                    if out:
                        with z.open(info) as src,open(out,'xb') as dst:
                            copied=0
                            while True:
                                block=src.read(65536)
                                if not block:break
                                copied+=len(block)
                                if copied>info.file_size:raise ValueError('storage_limit_exceeded')
                                dst.write(block)
                            if copied!=info.file_size:raise ValueError('invalid_archive_size')
                        out.chmod(0o644)
        elif kind=='tar':
            with tarfile.open(archive,'r|') as tf:
                for info in tf:
                    safe_parts(info.name)
                    if info.isdir():continue
                    if info.issym() or info.islnk():
                        if mode=='artifact' and info.issym() and '/.bin/' in '/'+info.name:
                            links.append((info.name,info.linkname));continue
                        raise ValueError('archive_links_forbidden')
                    if not info.isfile() or getattr(info,'sparse',None):raise ValueError('special_archive_entry_forbidden')
                    out=target(info.name,info.size)
                    if out:
                        src=tf.extractfile(info)
                        with open(out,'xb') as dst:shutil.copyfileobj(src,dst,65536)
                        out.chmod(0o755 if info.mode&0o111 else 0o644)
        else:raise ValueError('invalid_archive')
        # Only npm executable links into already-extracted regular files are allowed.
        for name,link in links:
            parts=safe_parts(name)[1:]
            out=root.joinpath(*parts)
            if out in seen or link.startswith('/') or '\\' in link:raise ValueError('archive_links_forbidden')
            target=pathlib.Path(os.path.normpath(str(out.parent/link)))
            if not target.is_relative_to(root) or not target.is_file() or target.is_symlink():raise ValueError('archive_links_forbidden')
            out.parent.mkdir(parents=True,exist_ok=True);out.symlink_to(link);seen.add(out)
        if kind=='zip':
            entries=list(root.iterdir())
            if len(entries)==1 and entries[0].is_dir():
                folder=entries[0]
                for child in folder.iterdir():child.rename(root/child.name)
                folder.rmdir()
        return size
    except BaseException:
        shutil.rmtree(root,ignore_errors=True);raise
if __name__=='__main__':
    try:print(extract(sys.argv[1],sys.argv[2],sys.argv[3],int(sys.argv[4]),sys.argv[5]))
    except Exception as e:
        print(str(e) if isinstance(e,ValueError) else 'archive_rejected',file=sys.stderr);sys.exit(1)
