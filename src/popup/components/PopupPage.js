import React, { Component } from "react";
import browser from "webextension-polyfill";
import log from "loglevel";
import { initSettings, getSettings, setSettings } from "src/settings/settings";
import { updateLogLevel, overWriteLogLevel } from "src/common/log";
import translate from "src/common/translate";
import Header from "./Header";
import InputArea from "./InputArea";
import ResultArea from "./ResultArea";
import Footer from "./Footer";
import "../styles/PopupPage.scss";
import transliterator from "src/common/transliterator"
import zabc_list_dict from "src/common/zabc"

const logDir = "popup/PopupPage";
const getTabInfo = async () => {
  try {
    const tab = (await browser.tabs.query({ currentWindow: true, active: true }))[0];
    const tabUrl = browser.tabs.sendMessage(tab.id, { message: "getTabUrl" });
    const selectedText = browser.tabs.sendMessage(tab.id, { message: "getSelectedText" });
    const isEnabledOnPage = browser.tabs.sendMessage(tab.id, { message: "getEnabled" });
    const tabInfo = await Promise.all([tabUrl, selectedText, isEnabledOnPage]);
    return {
      isConnected: true, url: tabInfo[0], selectedText: tabInfo[1], isEnabledOnPage: tabInfo[2]
    };
  } catch (e) { return { isConnected: false, url: "", selectedText: "", isEnabledOnPage: false }; }
};

export default class PopupPage extends Component {
  constructor(props) { super(props);
    this.state = { targetLang: "", langZtr: "", inputText: "", resultText: "", ztrText: "",  candidateText: "",
      sourceLang: "", statusText: "OK", tabUrl: "", isConnected: true,
      isEnabledOnPage: true,
      langHistory: []
    };
    this.isSwitchedSecondLang = false;
    this.init();
  }
  init = async () => {
    await initSettings(); overWriteLogLevel(); updateLogLevel();
    document.body.dataset.theme = getSettings("theme");
    const targetLang = getSettings("targetLang");
    let langHistory = getSettings("langHistory");
    if (!langHistory) {
      const secondLang = getSettings("secondTargetLang");
      langHistory = [targetLang, secondLang];
      setSettings("langHistory", langHistory);
    }
    this.setState({ targetLang: targetLang, langZtr: "abc5", langHistory: langHistory });

    const tabInfo = await getTabInfo();
    this.setState({ isConnected: tabInfo.isConnected, inputText: tabInfo.selectedText, tabUrl: tabInfo.url,
      isEnabledOnPage: tabInfo.isEnabledOnPage
    });
    if (tabInfo.selectedText !== "") this.handleInputText(tabInfo.selectedText);
  };

  handleInputText = inputText => { log.log(logDir, "handleInputText()", inputText);
    this.setState({ inputText: inputText });
    const waitTime = getSettings("waitTime");
    clearTimeout(this.inputTimer);
    this.inputTimer = setTimeout(async () => {
      const result = await this.translateText(inputText, this.state.targetLang);
      this.switchSecondLang(result);
    }, waitTime);
  };

  setLangHistory = lang => {
    let langHistory = getSettings("langHistory") || [];
    langHistory.push(lang);
    if (langHistory.length > 30) langHistory = langHistory.slice(-30);
    setSettings("langHistory", langHistory);
    this.setState({ langHistory: langHistory });
  };

  handleLangChange = lang => { log.info(logDir, "handleLangChange()", lang);
    this.setState({ targetLang: lang });
    const inputText = this.state.inputText;
    if (inputText !== "") this.translateText(inputText, lang, langZtr);
    this.setLangHistory(lang);
  };
  translateText = async (text, targetLang) => { log.info(logDir, "translateText()", text, targetLang);
    const result = await translate(text, "auto", targetLang);
    var ztrText = "";
    if (result.resultText !== "") {
      var t = new transliterator();
      ztrText = t.transliterate_indik_abc(result.resultText, zabc_list_dict);// + "\n" + this.state.resultText ;      
    }
    this.setState({
      resultText: result.resultText, ztrText: ztrText, candidateText: result.candidateText, statusText: result.statusText,
      sourceLang: result.sourceLanguage, 
    });
    return result;
  };
  handleZtrChange = ztr => { log.info(logDir, "handleZtrChange()", ztr);
    this.transliterateText(ztr);
  };  
  transliterateText = (ztr) => { log.info(logDir, "transliterateText()", sourceText, ztr);
    if (this.state.resultText !== "") {
      var t = new transliterator();
      const ztrText = t.transliterate_indik_abc(this.state.resultText, zabc_list_dict);// + "\n" + this.state.resultText ;      
      this.setState({ langZtr: ztr, ztrText: ztrText });
    }
    return ztrText;
  }
  switchSecondLang = result => {
    if (!getSettings("ifChangeSecondLang")) return;
    const defaultTargetLang = getSettings("targetLang"); const secondLang = getSettings("secondTargetLang");
    if (defaultTargetLang === secondLang) return;
    const equalsSourceAndTarget = result.sourceLanguage === this.state.targetLang && result.percentage > 0;
    const equalsSourceAndDefault = result.sourceLanguage === defaultTargetLang && result.percentage > 0;
    if (!this.isSwitchedSecondLang) {
      if (equalsSourceAndTarget && equalsSourceAndDefault) { log.info(logDir, "=>switchSecondLang()", result, secondLang);
        this.handleLangChange(secondLang); this.isSwitchedSecondLang = true;
      }
    } else {
      if (!equalsSourceAndDefault) { log.info(logDir, "=>switchSecondLang()", result, defaultTargetLang);
        this.handleLangChange(defaultTargetLang); this.isSwitchedSecondLang = false;
      }
    }
  };
  toggleEnabledOnPage = async e => { const isEnabled = e.target.checked; 
    this.setState({ isEnabledOnPage: isEnabled });
    try {
      const tab = (await browser.tabs.query({ currentWindow: true, active: true }))[0];
      if (isEnabled) await browser.tabs.sendMessage(tab.id, { message: "enableExtension" });
      else await browser.tabs.sendMessage(tab.id, { message: "disableExtension" });
    } catch (e) {}
  };

  render() {
    return (
      <div>
        <Header toggleEnabledOnPage={this.toggleEnabledOnPage} isEnabledOnPage={this.state.isEnabledOnPage}
          isConnected={this.state.isConnected}
        />
        <InputArea inputText={this.state.inputText} handleInputText={this.handleInputText} sourceLang={this.state.sourceLang} />
        <hr/>
        <ResultArea inputText={this.state.inputText} targetLang={this.state.targetLang} langZtr={this.state.langZtr}
          ztrText={this.state.ztrText} candidateText={this.state.candidateText}
          statusText={this.state.statusText}
        />
        <Footer tabUrl={this.state.tabUrl} targetLang={this.state.targetLang} langZtr={this.state.langZtr}
          langHistory={this.state.langHistory} handleLangChange={this.handleLangChange}
          handleZtrChange={this.handleZtrChange}/>
      </div>
    );
  }
}
