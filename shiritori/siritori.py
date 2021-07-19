from pykakasi import kakasi
import boto3
import json
import time
import datetime

def hiragana(text):
    print("読み込んだか？:"+text)
    #漢字をひらがなにする
    kakasi_ja = kakasi() # オブジェクトをインスタンス化
    print("インスタンス化")
    kakasi_ja.setMode('J', 'H') # モードの設定：J(Kanji) to H(Hiragana)
    print("モードの設定")
    conv = kakasi_ja.getConverter()
    print("変換準備")
    hira = conv.do(text)
    print("変換後："+hira)
    return hira# 変換して出力

def change_json(bucket, key):
    #S3のjsonファイルを読み込んで単語をピックアップする
    s3 = boto3.client('s3') #S3オブジェクトを取得
    response = s3.get_object(Bucket=bucket, Key=key+'.json') #bucket定義
    body = response['Body'].read()
    json_copy = json.loads(body.decode('utf-8'))
    word = json_copy['results']['transcripts'][0]['transcript'] #jsonファイルから変換文字列を抽出
    return word

def sound_to_word(bucket, filename, mylanguage):
    #.mp3をtranscribeで文章化
    output_bucket = 'siritori'
    dt_now = datetime.datetime.now()
    job_url = "s3://{}/{}".format(bucket, filename)
    transcribe = boto3.client('transcribe')
    job_name = str(dt_now.year)+str(dt_now.month)+str(dt_now.day)+"_"+str(dt_now.hour)+str(dt_now.minute)+str(dt_now.second)

    transcribe.start_transcription_job(
        TranscriptionJobName=job_name,
        Media = {'MediaFileUri': job_url},
        MediaFormat = 'webm',  #wav, mp4, mp3
        LanguageCode = mylanguage,
        OutputBucketName = output_bucket
    )
    #文章化の作業が終わるまで待機
    while True:
        status = transcribe.get_transcription_job(TranscriptionJobName=job_name)
        if status['TranscriptionJob']['TranscriptionJobStatus'] in ['COMPLETED', 'FAILED']:
            break
        print("Not ready yet...")
        time.sleep(5)
    print(status)
    #S3にあるjsonファイルから単語を抜き取って出力
    print("output_bucket:"+output_bucket)
    print("job_name:"+job_name)
    return change_json(output_bucket, job_name)

def translate(text, mylanguage, enemylanguage):
    #translateで相手の言語に翻訳
    translate = boto3.client('translate')# Translateのクライアントを作成
    result = translate.translate_text(Text=text, SourceLanguageCode=mylanguage, TargetLanguageCode=enemylanguage)
    return result['TranslatedText']
    #print('TranslatedText: ' + result.get('TranslatedText'))

def main(event, context): 
    ######### main関数 #########
    
    ### 必要な情報をとる ###
    bucket = event['bucket']
    filename = event['filename']
    mylanguage = event['origin']
    enemylanguage = event['target']
    
    ### 翻訳処理 ###
    
    #transcribe用に言語データを変換
    if mylanguage == 'ja':
        mylanguage_transcribe = 'ja-JP'
    elif mylanguage == 'en':
        mylanguage_transcribe = 'en-US'
    else:
        mylanguage_transcribe = 'it-IT'
    
    #音声.mp3を単語にする
    word = sound_to_word(bucket, filename, mylanguage_transcribe)
    print("言語化："+ word)
    
    #ピリオドを消す
    if word[(len(word)-1)] == '.' or word[(len(word)-1)] == '。':
        word = word[:(len(word)-1)]
        print("削除後："+word)
    
    #単語を翻訳する
    translated_word = translate(word, mylanguage, enemylanguage)
    print("翻訳："+ translated_word)
    
    #日本語ならひらがなにする
    if enemylanguage == "ja":
        print(type(translated_word))
        translated_word = hiragana(translated_word)
        print("ひらがな："+ translated_word)
    
    #json形式で"言った言葉"と"翻訳後の言葉"を出力
    return {'word':word, 'translated':translated_word}