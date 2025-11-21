#!/usr/bin/env python3
"""
Script para verificar dados do NBA baixados manualmente do Kaggle
Dataset: https://www.kaggle.com/datasets/wyattowalsh/basketball
"""

from pathlib import Path

def check_existing_files(data_dir):
    """Verifica se já existem arquivos CSV na pasta data"""
    csv_files = list(data_dir.glob('*.csv')) + list(data_dir.glob('*.CSV'))
    return csv_files

def validate_csv_files(csv_files):
    """Valida se os arquivos CSV são válidos"""
    valid_files = []
    invalid_files = []
    
    for f in csv_files:
        try:
            # Verificar se o arquivo não está vazio e tem tamanho razoável
            size = f.stat().st_size
            if size > 100:  # Pelo menos 100 bytes
                valid_files.append(f)
            else:
                invalid_files.append((f, f"muito pequeno ({size} bytes)"))
        except Exception as e:
            invalid_files.append((f, f"erro: {e}"))
    
    return valid_files, invalid_files

def print_manual_instructions():
    """Imprime instruções detalhadas para download manual"""
    data_path = Path('data').absolute()
    print("\n" + "=" * 60)
    print("📥 INSTRUÇÕES PARA DOWNLOAD MANUAL")
    print("=" * 60)
    print("\n1. Acesse o dataset no Kaggle:")
    print("   https://www.kaggle.com/datasets/wyattowalsh/basketball")
    print("\n2. Faça login no Kaggle (crie uma conta gratuita se necessário)")
    print("\n3. Clique no botão 'Download' (canto superior direito)")
    print("\n4. Extraia o arquivo ZIP baixado")
    print("\n5. Copie todos os arquivos CSV para a pasta:")
    print(f"   {data_path}")
    print("\n6. Execute novamente este script para verificar:")
    print("   python3 download-nba-data.py")
    print("\n" + "=" * 60)

def main():
    print("🏀 Verificador de Dados do NBA")
    print("=" * 60)
    print("📊 Dataset: wyattowalsh/basketball")
    print("=" * 60)
    
    # Criar diretório
    data_dir = Path("data")
    data_dir.mkdir(parents=True, exist_ok=True)
    
    # Verificar se já existem arquivos
    existing_files = check_existing_files(data_dir)
    
    if existing_files:
        print(f"\n📁 Encontrados {len(existing_files)} arquivo(s) CSV:")
        print("-" * 60)
        
        valid_files, invalid_files = validate_csv_files(existing_files)
        
        # Mostrar arquivos válidos
        if valid_files:
            print(f"\n✅ {len(valid_files)} arquivo(s) válido(s):")
            total_size = 0
            for f in valid_files:
                size_mb = f.stat().st_size / (1024 * 1024)
                total_size += size_mb
                print(f"   ✓ {f.name:40s} {size_mb:8.2f} MB")
            print(f"\n   Total: {total_size:.2f} MB")
        
        # Mostrar arquivos inválidos
        if invalid_files:
            print(f"\n⚠️  {len(invalid_files)} arquivo(s) com problema:")
            for f, reason in invalid_files:
                print(f"   ✗ {f.name:40s} ({reason})")
        
        if len(valid_files) > 0:
            print("\n" + "=" * 60)
            print("✅ Dados prontos para uso!")
            print("=" * 60)
            print("\n💡 Próximos passos:")
            print("   1. Execute: npm install")
            print("   2. Execute: npm run dev")
            print("   3. Acesse: http://localhost:3000")
            print("   4. Clique em 'Ingerir/Atualizar banco'")
        else:
            print("\n" + "=" * 60)
            print("❌ Nenhum arquivo válido encontrado")
            print("=" * 60)
            print_manual_instructions()
    else:
        print("\n❌ Nenhum arquivo CSV encontrado na pasta data/")
        print_manual_instructions()

if __name__ == "__main__":
    main()
