import os
import hashlib
from collections import defaultdict

def get_md5(file_path):
    hash_md = hashlib.md5()
    try:
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md.update(chunk)
        return hash_md.hexdigest()
    except Exception:
        return None

def analyze():
    base_dir = "."
    file_types = {
        '음원': ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg'],
        '이미지': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.psd', '.psxprj'],
        '문서': ['.pdf', '.docx', '.doc', '.txt', '.xlsx', '.xls', '.pptx', '.ppt', '.gsheet', '.gdoc', '.csv']
    }
    
    type_counts = defaultdict(int)
    type_files = defaultdict(list)
    size_groups = defaultdict(list)
    all_files = []

    for root, dirs, files in os.walk(base_dir):
        # Skip hidden directories
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for file in files:
            if file.startswith('.'):
                continue
            
            file_path = os.path.join(root, file)
            all_files.append(file_path)
            
            ext = os.path.splitext(file)[1].lower()
            
            found_type = '기타'
            for t, exts in file_types.items():
                if ext in exts:
                    found_type = t
                    break
            
            type_counts[found_type] += 1
            type_files[found_type].append(file_path)
            
            try:
                size = os.path.getsize(file_path)
                size_groups[size].append(file_path)
            except OSError:
                continue

    # Find duplicates
    duplicates = []
    for size, paths in size_groups.items():
        if len(paths) > 1:
            hashes = defaultdict(list)
            for p in paths:
                h = get_md5(p)
                if h:
                    hashes[h].append(p)
            
            for h, h_paths in hashes.items():
                if len(h_paths) > 1:
                    duplicates.append(h_paths)

    # Write results
    with open("analysis_result.txt", "w", encoding="utf-8") as f:
        f.write("=== 워크스페이스 파일 분석 결과 ===\n\n")
        f.write(f"1. 전체 파일 수: {len(all_files)}개\n\n")
        
        f.write("2. 파일 종류별 분류:\n")
        for t, count in type_counts.items():
            f.write(f"  - {t}: {count}개\n")
        f.write("\n")
        
        f.write("3. 중복 파일 목록 (내용이 동일한 파일):\n")
        if not duplicates:
            f.write("  - 중복 파일이 없습니다.\n")
        else:
            for idx, group in enumerate(duplicates, 1):
                f.write(f"  [그룹 {idx}]\n")
                for p in group:
                    f.write(f"    {p}\n")
        f.write("\n")
        
        f.write("4. 전체 파일 목록:\n")
        for p in sorted(all_files):
            f.write(f"  {p}\n")

    print(f"분석 완료! 결과가 'analysis_result.txt'에 저장되었습니다.")

if __name__ == "__main__":
    analyze()
